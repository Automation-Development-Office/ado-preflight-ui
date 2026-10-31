// Deterministic documentation lookup. Not a language model.
// Answers come from bundled documents and structured troubleshooting entries.

const STOP = new Set([
  'how', 'can', 'the', 'use', 'does', 'what', 'with', 'show', 'readme', 'examples',
  'please', 'want', 'about', 'for', 'ado', 'infra', 'who', 'won', 'and', 'are',
  'any', 'you', 'me', 'my', 'is', 'to', 'of', 'in', 'on', 'an', 'or', 'do', 'get',
  'why', 'this', 'that', 'it', 'fix', 'not', 'working', 'failing', 'failed', 'does',
  'should', 'first', 'give', 'commands', 'command', 'mean', 'explain', 'terms',
  'simpler', 'verify', 'check'
]);

const SYNONYM_GROUPS = [
  ['virtualization', 'virt', 'ocp_virtualization', 'kubevirt', 'cnv', 'ocp_wait_operator', 'csv', 'ansibleunicode'],
  ['gitlab', 'saml', 'oauth2', 'git.username', 'username', 'pat', 'x-token-auth'],
  ['inventory', 'timeout', 'timed', 'request_timeout', 'organizations', 'bootstrap_controller'],
  ['vault', 'ansible_vars_enabled', 'source_vars', 'group_vars', 'decrypt', 'ado-vault', 'ado-inventory'],
  ['devspaces', 'dev spaces', 'devspace', 'dashboard', 'samples', 'sample', 'che', 'ocp_devspaces'],
  ['grafana', 'postgres', 'postgresql', 'sqlite', 'grafana_install', 'grafana_database_type'],
  ['credential', 'set-url', 'git-credentials', 'bearer', 'remote'],
  ['scm', 'source', 'control', 'bootstrap_generate_env_vars'],
  ['tarball', 'restart_pod', 'preflight', 'collection']
];

function roleReadme(documents, role) {
  const needle = role.toLowerCase();
  return documents.find(d => d.path.toLowerCase() === `infra.automation_development_office/roles/${needle}/readme.md`)
    || documents.find(d => d.path.toLowerCase().includes(`/roles/${needle}/readme.md`));
}

function isTroubleshootingPath(docPath) {
  return /\/docs\/troubleshooting\/[a-z0-9-]+\.md$/i.test(String(docPath || '').replace(/\\/g, '/'));
}

function section(text, name) {
  const re = new RegExp(`(?:^|\\n)## ${name}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = String(text || '').match(re);
  return match ? match[1].trim() : '';
}

function prose(body) {
  return String(body || '')
    .replace(/```[a-z]*\n[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fences(body) {
  return [...String(body || '').matchAll(/```[a-z]*\n([\s\S]*?)```/gi)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

export function parseTroubleshooting(doc) {
  if (!doc || !isTroubleshootingPath(doc.path)) return null;
  const text = String(doc.text || '');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const meta = {};
  if (fm) {
    fm[1].split('\n').forEach(line => {
      const match = line.match(/^([a-z_]+):\s*(.*)$/);
      if (match) meta[match[1]] = match[2].trim();
    });
  }
  const discovery = section(text, 'Discovery');
  const verification = section(text, 'Verification');
  return {
    doc,
    meta,
    problem: section(text, 'Problem'),
    symptoms: section(text, 'Symptoms'),
    cause: section(text, 'Root cause'),
    resolution: section(text, 'Resolution'),
    simpler: section(text, 'Simpler'),
    discovery,
    verification,
    commands: [
      ...fences(discovery).map(textBlock => ({ label: 'Check first', text: textBlock })),
      ...fences(verification).map(textBlock => ({ label: 'Verification', text: textBlock })),
      ...fences(section(text, 'Resolution')).map(textBlock => ({ label: 'Resolution', text: textBlock }))
    ]
  };
}

function expandNeedles(question) {
  const q = question.toLowerCase();
  const words = q.match(/[a-z0-9_'.]+/g) || [];
  const needles = new Set(words.filter(word => word.length > 2 && !STOP.has(word)));
  SYNONYM_GROUPS.forEach(group => {
    if (group.some(term => q.includes(term))) group.forEach(term => needles.add(term));
  });
  return needles;
}

function scoreDoc(doc, question, needles) {
  const path = doc.path.toLowerCase();
  if (path.includes('/molecule/') || path.includes('/extensions/molecule/')) return 0;
  const entry = parseTroubleshooting(doc);
  const body = `${path}\n${doc.text || ''}`.toLowerCase();
  let score = 0;
  needles.forEach(needle => {
    if (body.includes(needle)) score += path.includes(needle) ? 8 : 2;
  });
  if (!entry) return score;
  const keywords = String(entry.meta.keywords || '').toLowerCase();
  let extra = 0;
  needles.forEach(needle => {
    if (keywords.includes(needle)) extra += 25;
  });
  const symptomLines = entry.symptoms.split('\n').map(line => line.replace(/^-\s*/, '').trim()).filter(line => line.length > 12);
  const q = question.toLowerCase();
  const flatQ = q.replace(/[`'"]/g, '');
  symptomLines.forEach(line => {
    const snippet = line.toLowerCase().replace(/[`'"]/g, '');
    if (snippet.length > 12 && (flatQ.includes(snippet) || snippet.includes(flatQ))) extra += 80;
  });
  if (entry.meta.component && q.includes(String(entry.meta.component).toLowerCase())) extra += 40;
  if (score === 0 && extra === 0) return 0;
  return score + extra + 15;
}

function statusLine(entry) {
  const status = entry.meta.status || 'proposed';
  return `Status: ${status}. This is a documented troubleshooting entry, not a guess from a language model.`;
}

function formatEntry(entry, mode) {
  const commands = entry.commands || [];
  const sources = [entry.doc.path];
  if (mode === 'commands') {
    return {
      answer: commands.length
        ? `Commands from the documented entry for ${entry.meta.component || entry.meta.id}.\n\n${statusLine(entry)}`
        : `The troubleshooting entry for ${entry.meta.component || entry.meta.id} does not list commands.\n\n${statusLine(entry)}`,
      commands,
      sources
    };
  }
  if (mode === 'verify') {
    return {
      answer: `Verification\n${prose(entry.verification) || 'This entry does not list a verification step.'}\n\n${statusLine(entry)}`,
      commands: commands.filter(command => command.label === 'Verification'),
      sources
    };
  }
  if (mode === 'check') {
    return {
      answer: `Check first\n${prose(entry.discovery) || 'This entry does not list a discovery step.'}\n\n${statusLine(entry)}`,
      commands: commands.filter(command => command.label === 'Check first'),
      sources
    };
  }
  if (mode === 'fix') {
    return {
      answer: `Resolution\n${prose(entry.resolution) || 'This entry does not list a resolution.'}\n\n${statusLine(entry)}`,
      commands: commands.filter(command => command.label === 'Resolution'),
      sources
    };
  }
  if (mode === 'error') {
    return {
      answer: `Problem\n${entry.symptoms || entry.problem}\n\nLikely cause\n${entry.cause}\n\n${statusLine(entry)}`,
      commands: [],
      sources
    };
  }
  if (mode === 'simpler') {
    return {
      answer: `Simpler\n${entry.simpler || entry.problem}\n\n${statusLine(entry)}`,
      commands: [],
      sources
    };
  }
  if (mode === 'why') {
    return {
      answer: `Problem\n${entry.problem}\n\nLikely cause\n${entry.cause}\n\n${statusLine(entry)}`,
      commands: [],
      sources
    };
  }
  return {
    answer: [
      'Problem',
      entry.problem,
      '',
      'Likely cause',
      entry.cause,
      '',
      'Check first',
      prose(entry.discovery) || 'No discovery step is documented.',
      '',
      'Resolution',
      prose(entry.resolution),
      '',
      'Verification',
      prose(entry.verification),
      '',
      statusLine(entry)
    ].join('\n'),
    commands,
    sources
  };
}

function followIntent(question) {
  const s = question.trim().toLowerCase();
  if (/^what about\b/.test(s)) return { type: 'switch', rest: s.replace(/^what about\s+/, '').trim() };
  if (/give me the commands|\bthe commands\b/.test(s)) return { type: 'commands' };
  if (/how do i verify|verify the fix|verify it/.test(s)) return { type: 'verify' };
  if (/what should i check|check first/.test(s)) return { type: 'check' };
  if (/how do i fix|fix it/.test(s)) return { type: 'fix' };
  if (/what does this error mean|this error/.test(s)) return { type: 'error' };
  if (/simpler terms|explain that|in simpler/.test(s)) return { type: 'simpler' };
  if (/why is this failing|why is it failing/.test(s)) return { type: 'why' };
  return null;
}

function lastTopic(history) {
  for (let i = (history || []).length - 1; i >= 0; i -= 1) {
    if (history[i] && history[i].topic) return history[i].topic;
  }
  return '';
}

function entryById(documents, id) {
  return documents
    .map(parseTroubleshooting)
    .filter(Boolean)
    .find(entry => entry.meta.id === id) || null;
}

function noneAnswer() {
  return {
    kind: 'none',
    topic: '',
    answer: 'I do not have a documented answer for that in the bundled ADO docs or troubleshooting entries. I will not invent a fix. Name a role (for example infra.automation_development_office.ocp_nfs_storage) or paste the error line.',
    documents: [],
    commands: []
  };
}

function fromEntry(entry, mode, extraDocs) {
  const formatted = formatEntry(entry, mode);
  const docs = [entry.doc, ...(extraDocs || []).filter(doc => doc.path !== entry.doc.path)];
  return {
    kind: 'documented',
    topic: entry.meta.id || '',
    answer: formatted.answer,
    documents: docs.slice(0, 3),
    commands: formatted.commands
  };
}

export function answerQuestion(question, documents, history) {
  const docs = Array.isArray(documents) ? documents : null;
  if (!docs) {
    return {
      kind: 'unavailable',
      topic: '',
      answer: 'The documentation bundle did not load. This is not a search miss. Rebuild and restart preflight, then ask again.',
      documents: [],
      commands: []
    };
  }
  const asked = String(question || '').trim();
  const q = asked.toLowerCase();
  if (!q) return noneAnswer();

  const intent = followIntent(asked);
  if (intent && intent.type === 'switch') {
    const switched = answerQuestion(intent.rest, docs, []);
    return switched.topic ? switched : { ...switched, topic: switched.topic || '' };
  }
  if (intent) {
    const topic = lastTopic(history);
    const entry = topic ? entryById(docs, topic) : null;
    if (!entry) {
      return {
        kind: 'follow-up',
        topic: topic || '',
        followUp: 'Which component or error should I use? For example ocp_wait_operator, GitLab username, or the inventory timeout.',
        answer: 'I need the previous topic before I can answer that follow-up. I will not guess a component.',
        documents: [],
        commands: []
      };
    }
    return fromEntry(entry, intent.type);
  }

  const requested = q.match(/infra\.ado\.([a-z0-9_]+)/)?.[1];
  const alias = { install_keycloak: 'install_rhbk', install_keyclaok: 'install_rhbk' };
  if (requested) {
    const role = alias[requested] || requested;
    const doc = roleReadme(docs, role);
    if (!doc) {
      return {
        kind: 'none',
        topic: '',
        answer: `I cannot find infra.automation_development_office.${requested} in the bundled READMEs. No usage example can be verified for that name.`,
        documents: [],
        commands: []
      };
    }
    const entry = docs.map(parseTroubleshooting).filter(Boolean)
      .find(item => String(item.meta.component || '').endsWith(role));
    return {
      kind: 'documented',
      topic: entry?.meta.id || role,
      answer: requested !== role
        ? `There is no infra.automation_development_office.${requested} role in this bundle. The documented Red Hat Build of Keycloak role is infra.automation_development_office.${role}. Open its README for the variables and examples.`
        : `Here is the bundled README for infra.automation_development_office.${role}. Open the source for its variables and examples. I am not inventing steps beyond that file.`,
      documents: entry ? [doc, entry.doc] : [doc],
      commands: []
    };
  }

  if (/not using aap|without aap|no[- ]aap|without ansible automation|local playbooks|run playbooks in (the )?pod|walk me through.*(not using|without) aap|show me how to use without aap|show me how to use not using aap/.test(q)) {
    return {
      kind: 'guide',
      guide: 'local',
      topic: 'not-using-aap',
      answer: 'Let’s walk through Not using AAP: generate the playbook repo in this pod, then run the generated playbooks here (no Contoller). Use “Show me” to jump to each form section. After Bootstrap, use each playbook’s Options (state / channel / -e) and Preview ? for a step-through explain.',
      documents: [],
      commands: []
    };
  }
  if (/playbook options|per[- ]playbook|common extra vars|step options|freeform -e/.test(q)) {
    return {
      kind: 'guide',
      guide: 'local',
      topic: 'not-using-aap',
      answer: 'Common extra vars sets state=present|absent for every selected playbook. Each step’s Options overrides state for that playbook only, and can set typed fields (ACM/Virt channel, Virt KubeSecondaryDNS) plus freeform -e. Preview commands, then click ? for a step-through explain.',
      documents: [],
      commands: []
    };
  }
  if (/fleet management|all clusters|acm console|console plug-?in|multiclusterhub.*(ui|console)|why.*(acm|fleet).*(not|missing|show)/.test(q)) {
    const doc = roleReadme(docs, 'ocp_acm');
    return {
      kind: 'documented',
      topic: 'ocp_acm',
      answer: 'ACM needs MultiClusterHub Running plus Console plug-ins acm and mce for Fleet Management. infra.automation_development_office.ocp_acm waits for Running and enables those plug-ins by default. If install is stuck Uninstalling from a prior delete, present heals that first (ocp_acm_heal_stuck_uninstall) or run state=absent for a thorough hub cleanup, then present again. Refresh the console and open Fleet Management (or All Clusters).',
      documents: doc ? [doc] : [],
      commands: []
    };
  }
  if (/acm.*(absent|uninstall|cleanup|stuck)|stuck.*(uninstall|multiclusterhub|mch)/.test(q)) {
    const doc = roleReadme(docs, 'ocp_acm');
    return {
      kind: 'documented',
      topic: 'ocp_acm',
      answer: 'Use Common extra vars or playbook Options with state=absent. ocp_acm removes MultiClusterHub and related hub objects (MultiClusterEngine, ClusterManager, local-cluster ManagedCluster), clears stuck uninstall finalizers, and drops known ACM validating webhooks whose Service is already gone. Then re-run with state=present.',
      documents: doc ? [doc] : [],
      commands: []
    };
  }
  if (/nfs[_\s-]?csi|csi[_\s-]?driver[_\s-]?nfs|nfs[_\s-]?storage|synology[_\s-]?nfs|ocp_nfs_storage|install.*nfs|nfs.*storage\s*class|storage\s*class.*nfs/.test(q)) {
    const doc = roleReadme(docs, 'ocp_nfs_storage');
    return {
      kind: 'documented',
      topic: 'ocp_nfs_storage',
      answer: [
        'NFS CSI is under OpenShift Options → Storage class → NFS CSI tab (infra.automation_development_office.ocp_nfs_storage).',
        'Enable NFS CSI, set nfs_server + nfs_share (optional StorageClass name, default synology-nfs-csi). Install during Bootstrap is on by default.',
        'Synology iSCSI is the sibling tab under the same Storage class option.',
        'Bootstrap expands to component_options nfs_csi / iscsi_csi for the collection. Contoller / local playbook: playbooks/openshift/ado-install-nfs-csi-bootstrap.yml.',
        'App storage fields (RHBK/Grafana/…) only Look up an existing StorageClass after the driver is installed.',
        'Open the bundled README for exact variables and examples.'
      ].join(' '),
      documents: doc ? [doc] : [],
      commands: []
    };
  }
  if (/\baap\b|automation platform/.test(q) && /install|deploy|set ?up/.test(q) && !/\brhel\b|standalone|remove|delete|without|not using/.test(q)) {
    return {
      kind: 'guide',
      guide: 'aap',
      topic: 'install-aap',
      answer: 'Let’s walk through installing a new AAP instance on OpenShift. Use “Show me” to follow the existing form.',
      documents: [],
      commands: []
    };
  }

  if (/^(why is this( not working)?|what broke|why is this failing)\b/.test(q) && !lastTopic(history)) {
    return {
      kind: 'follow-up',
      topic: '',
      followUp: 'Which component is failing, or paste the error line? For example virtualization, GitLab username, or inventory timeout.',
      answer: 'I need a component or an error line before I can match a documented issue. I will not pick a cause from a vague question.',
      documents: [],
      commands: []
    };
  }

  const needles = expandNeedles(asked);
  const ranked = docs
    .map(doc => ({ doc, score: scoreDoc(doc, asked, needles) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || ranked[0].score < 10) return noneAnswer();

  const topEntry = parseTroubleshooting(ranked[0].doc);
  if (topEntry && ranked[0].score >= 20) {
    const extras = ranked.slice(1, 3).map(item => item.doc).filter(doc => !isTroubleshootingPath(doc.path));
    return fromEntry(topEntry, 'full', extras);
  }

  const picked = ranked.slice(0, 3).map(item => item.doc);
  return {
    kind: 'documented',
    topic: '',
    answer: 'These bundled documents match your question. Open a source for the exact instructions. I am not adding steps that are not in those files.',
    documents: picked,
    commands: []
  };
}
