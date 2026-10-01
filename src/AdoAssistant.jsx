import React, { useEffect, useRef, useState } from 'react';
import { Button, TextInput } from '@patternfly/react-core';
import './ado-assistant.css';
import { answerQuestion } from './assistantKnowledge.mjs';

const EXPLAIN_HEADINGS = [
  'Your current selection (secrets redacted):',
  'What the command-line -e values mean:',
  'Where the rest of the variables come from:',
  'Inventory is the generated repo inventory (localhost). Collections come from /workspace/collections installed at bootstrap.',
  'Preview command:'
];

function GroupVarsPanel({ groupVars }) {
  const files = groupVars?.files || [];
  const [selected, setSelected] = useState(groupVars?.defaultFile || files[0]?.name || '');
  useEffect(() => {
    setSelected(groupVars?.defaultFile || files[0]?.name || '');
  }, [groupVars?.dir, groupVars?.defaultFile]);
  if (!groupVars) return null;
  const current = files.find(f => f.name === selected) || files[0];
  const contentHasState = /^state:\s*\S+/m.test(String(current?.content || ''));
  const playbook = String(groupVars.playbook || '');
  const showStateHint = /cert-manager|htpass|deploy|bootstrap/i.test(playbook);
  return (
    <div className="ado-assistant-group-vars">
      <p className="ado-assistant-answer-heading">
        group_vars on disk ({groupVars.dir || 'group_vars/all/<env>'})
      </p>
      {showStateHint && (
        <p className="ado-assistant-group-vars-state">
          <strong>state</strong>
          {contentHasState
            ? ' — see this file (below). Contoller survey / Additional options -e state=absent still override.'
            : " — not in this file yet. Roles use state|default('present') so install runs without -e state. Use Common extra vars (state=absent) or -e state=absent to uninstall. Re-run Bootstrap to write state: present into vars_*.yml."}
        </p>
      )}
      {groupVars.error && !files.length ? (
        <p className="ado-assistant-answer-line">{groupVars.error}</p>
      ) : (
        <>
          <label className="ado-assistant-group-vars-label" htmlFor={`ado-gv-${groupVars.dir}-${current?.name || 'file'}`}>
            File
          </label>
          <select
            id={`ado-gv-${groupVars.dir}-${current?.name || 'file'}`}
            className="ado-assistant-group-vars-select"
            value={current?.name || ''}
            onChange={e => setSelected(e.target.value)}
          >
            {files.map(f => (
              <option key={f.name} value={f.name}>
                {f.path}{f.preferred ? ' ★' : ''}{f.vault ? ' (vault)' : ''}
              </option>
            ))}
          </select>
          {current && (
            <pre className="ado-assistant-group-vars-pre" tabIndex={0}>
              {current.content || '# (empty)'}
            </pre>
          )}
          <small className="ado-assistant-group-vars-hint">
            ★ = playbook vars_files for this component. Secrets / vault / PEM redacted.
          </small>
        </>
      )}
    </div>
  );
}

function AnswerBody({ text }) {
  const lines = String(text || '').split('\n');
  let sawTitle = false;
  return (
    <div className="ado-assistant-answer">
      {lines.map((line, i) => {
        if (!line) {
          return <div key={i} className="ado-assistant-answer-blank" aria-hidden="true" />;
        }
        const isHeading = EXPLAIN_HEADINGS.includes(line)
          || line.startsWith('Your current selection')
          || line.startsWith('What the command-line')
          || line.startsWith('Where the rest of the variables')
          || line.startsWith('Preview command:')
          || line.startsWith('Inventory is the generated repo inventory');
        if (isHeading) {
          return <p key={i} className="ado-assistant-answer-heading">{line}</p>;
        }
        if (/^\d+\./.test(line.trim())) {
          return <p key={i} className="ado-assistant-answer-step">{line}</p>;
        }
        if (!sawTitle) {
          sawTitle = true;
          return <p key={i} className="ado-assistant-answer-title">{line}</p>;
        }
        return <p key={i} className="ado-assistant-answer-line">{line}</p>;
      })}
    </div>
  );
}

const guides = {
  aap: {
    label: 'Install AAP on OpenShift',
    steps: [
      ['install', 'Enable installation', 'Open Install AAP and select “Install AAP on OpenShift”. Leave Controller configuration off for an install-only run.'],
      ['connection', 'Connect to OpenShift', 'Enter your cluster API URL and API token in the form. Keep credentials in the form, not in this conversation. Review TLS certificate verification for your cluster.'],
      ['namespace', 'Choose the namespace', 'Enter the namespace for the new AAP instance. Use your environment’s naming convention.'],
      ['version', 'Choose version and operator scope', 'Select the intended AAP version and operator scope. Check existing operator installations first: multiple operator versions cannot coexist on the same cluster.'],
      ['storage', 'Choose storage', 'Choose a storage class appropriate for AAP. Review the route host, replicas, and license settings in the same form.'],
      ['review', 'Review before running', 'Review the normal Preflight validation and bootstrap settings. In a disconnected environment, the required operator catalog, images, collections, and execution environment must already be available internally. This walkthrough does not check their availability or start an installation.']
    ]
  },
  local: {
    label: 'Not using AAP',
    steps: [
      ['local-mode', 'Choose Not using AAP', 'On Core Environment → Ansible Automation Platform Configuration, select “Not using AAP”. Bootstrap will generate the playbook repo in this pod without configuring Contoller.'],
      ['local-env', 'Fill Core Environment', 'Set environment name, domain, Git settings, and OpenShift API details if you will deploy OpenShift apps. Secrets stay in the form (and later vault files), not in this chat.'],
      ['local-components', 'Select components', 'Choose the OpenShift / platform components you want. Those selections drive generated playbooks and the ordered local run list.'],
      ['local-options', 'Common extra vars + Additional options', 'Common extra vars sets state=present|absent for every playbook (install vs uninstall). Expand Additional ansible-playbook options only for rare global flags. Prefer each playbook’s Options for channel / freeform -e.'],
      ['local-bootstrap', 'Run Bootstrap', 'Use ⊕ Run Bootstrap in the ADO Bootstrap Console. That only generates the repo and group_vars (no Contoller). Wait for the green complete banner.'],
      ['local-playbooks', 'Run generated playbooks', 'Expand “Run generated playbooks (no AAP)”. Use Options on each step (state override, channel, freeform -e). Preview commands, then Run selected playbooks. Click ? on a preview line for a step-through explain in this assistant.'],
      ['local-acm-fleet', 'ACM Fleet Management UI', 'After ACM succeeds, refresh the OpenShift console. Open Fleet Management (or All Clusters). ADO enables acm + mce Console plug-ins by default; if missing, re-run the ACM playbook with state=present.']
    ]
  }
};

export default function AdoAssistant({
  open,
  onClose,
  onShow,
  seedMessage,
  onSeedConsumed,
  installed,
  connectionReady,
  namespaceReady,
  notUsingAap,
  envReady,
  componentsReady,
  localPlanReady,
  dark
}) {
  const [step, setStep] = useState(0);
  const [guide, setGuide] = useState('aap');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [knowledge, setKnowledge] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const heading = useRef(null);

  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    if (!knowledge) {
      fetch('/assistant-knowledge.json').then(r => {
        if (!r.ok) throw new Error('Documentation bundle unavailable. Rebuild the UI.');
        return r.json();
      }).then(setKnowledge).catch(e => setError(e.message));
    }
  }, [open]);

  useEffect(() => {
    if (!open || !seedMessage) return;
    setGuide(null);
    setMessages(m => [...m.slice(-5), {
      question: seedMessage.question,
      answer: seedMessage.answer,
      documents: seedMessage.documents || [],
      groupVars: seedMessage.groupVars || null
    }]);
    onSeedConsumed?.();
  }, [open, seedMessage]);

  useEffect(() => {
    if (!open) return;
    const masthead = document.getElementById('ado-masthead');
    if (!masthead) return;
    const update = () => document.documentElement.style.setProperty('--ado-masthead-height', `${masthead.getBoundingClientRect().bottom}px`);
    const observer = new ResizeObserver(update);
    observer.observe(masthead);
    update();
    return () => observer.disconnect();
  }, [open]);

  if (!open) return null;

  const activeGuide = guide && guides[guide] ? guide : null;
  const guideDef = activeGuide ? guides[activeGuide] : null;
  const steps = guideDef?.steps || [];
  const current = steps[step] || steps[0];

  const sources = (knowledge?.documents || []).filter(d => search.trim()
    ? (d.path + '\n' + d.text).toLowerCase().includes(search.toLowerCase().trim())
    : [
      'infra.ado/roles/install_aap/README.md',
      'infra.ado/roles/ocp_nfs_storage/README.md',
      'ado-preflight-ui/README.md'
    ].includes(d.path));

  const startGuide = (id) => {
    setGuide(id);
    setStep(0);
  };

  const ask = e => {
    e.preventDefault();
    if (!question.trim()) return;
    const result = answerQuestion(question, knowledge?.documents || []);
    setMessages(m => [...m.slice(-5), { question, ...result }]);
    if (result.guide && guides[result.guide]) {
      startGuide(result.guide);
    } else if (!result.guide) {
      setGuide(null);
    }
    setQuestion('');
  };

  return (
    <aside className={`ado-assistant ${dark ? 'dark' : ''}`} aria-labelledby="ado-assistant-title" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <header>
        <div>
          <h2 id="ado-assistant-title" ref={heading} tabIndex={-1}>ADO Assistant</h2>
          <small>Role help · guided walkthroughs</small>
        </div>
        <Button variant="plain" aria-label="Close ADO Assistant" onClick={onClose}>✕</Button>
      </header>
      <div className="ado-assistant-body">
        <p>
          Explore ADO roles and examples, or follow a form walkthrough for Install AAP on OpenShift
          or Not using AAP (generate + run playbooks in this pod). Use <strong>?</strong> on a
          Preview command to explain that playbook’s vars.
        </p>
        <div className="ado-assistant-note">
          Offline guided preview and README lookup. No AI language model is configured — answers are
          curated steps plus bundled README search. Questions stay in this page.
        </div>
        {messages.map((m, i) => (
          <div key={i} className="ado-assistant-message">
            <strong>You</strong>
            <p>{m.question}</p>
            <strong>ADO Assistant</strong>
            <AnswerBody text={m.answer} />
            {m.groupVars && <GroupVarsPanel groupVars={m.groupVars} />}
            {m.documents?.length > 0 && (
              <>
                <hr className="ado-assistant-readme-divider" />
                {m.documents.map(doc => (
                  <details key={doc.path} className="ado-assistant-readme-block">
                    <summary>{doc.path}</summary>
                    <pre>{doc.text}</pre>
                  </details>
                ))}
              </>
            )}
          </div>
        ))}
        <form onSubmit={ask} className="ado-assistant-question">
          <TextInput
            aria-label="Ask ADO Assistant"
            placeholder="Show me how to use Not using AAP"
            value={question}
            onChange={(_, v) => setQuestion(v)}
          />
          <Button type="submit" variant="secondary" isDisabled={!knowledge}>Ask</Button>
        </form>
        <div className="ado-assistant-navigation" style={{ marginTop: '8px', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => startGuide('aap')}>Start ADO walk through with AAP</Button>
          <Button variant="secondary" onClick={() => startGuide('local')}>Start ADO walk through without AAP</Button>
        </div>
        {guideDef && current && (
          <div className="ado-assistant-step">
            <small>{guideDef.label} — step {step + 1} of {steps.length}</small>
            <h3>{current[1]}</h3>
            <p>{current[2]}</p>
            <Button variant="primary" onClick={() => onShow(current[0])}>Show me</Button>
            <div className="ado-assistant-navigation">
              <Button variant="link" isDisabled={!step} onClick={() => setStep(s => s - 1)}>Back</Button>
              <Button variant="link" isDisabled={step === steps.length - 1} onClick={() => setStep(s => s + 1)}>Next step</Button>
            </div>
          </div>
        )}
        <h3>Form progress</h3>
        {activeGuide === 'local' ? (
          <>
            <ul>
              <li>{notUsingAap ? '✓' : '○'} Not using AAP selected</li>
              <li>{envReady ? '✓' : '○'} Environment and domain entered</li>
              <li>{componentsReady ? '✓' : '○'} Components selected</li>
              <li>{localPlanReady ? '✓' : '○'} Bootstrap completed (local playbook plan ready)</li>
            </ul>
            <small>Progress reflects form state only — not a successful cluster deploy.</small>
          </>
        ) : (
          <>
            <ul>
              <li>{installed ? '✓' : '○'} Install AAP selected</li>
              <li>{connectionReady ? '✓' : '○'} API host and token entered</li>
              <li>{namespaceReady ? '✓' : '○'} Namespace entered</li>
            </ul>
            <small>Entered values are not a connectivity or deployment check.</small>
          </>
        )}
        <details className="ado-assistant-docs">
          <summary>Bundled documentation {knowledge ? `(${knowledge.documents.length} READMEs)` : ''}</summary>
          <p>Source: {knowledge?.collection || 'Loading…'}</p>
          {error && <p role="alert">{error}</p>}
          <TextInput aria-label="Search bundled READMEs" placeholder="Search all ADO / Preflight READMEs" value={search} onChange={(_, v) => setSearch(v)} />
          <p>{sources.length} matching documents</p>
          {sources.map(d => (
            <details key={d.path}>
              <summary>{d.path}</summary>
              <pre>{d.text}</pre>
            </details>
          ))}
        </details>
      </div>
    </aside>
  );
}
