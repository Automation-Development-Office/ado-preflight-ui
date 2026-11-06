import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRhbkClientReferences } from '../src/rhbkClients.mjs';
import { OIDC_DEFAULT_CLIENT_IDS } from '../src/oidcClientDefaults.generated.mjs';

// A blank client ID means the component's default client from the collection's
// components_defaults.yml. The form and the collection must agree, including when
// that default client was removed.

const here = path.dirname(fileURLToPath(import.meta.url));
const COLLECTION = process.env.ADO_COLLECTION_DIR || path.resolve(here, '../../ado');
const VALIDATOR_DIR = path.join(COLLECTION, 'roles/bootstrap_generate_env_vars/files');
const haveCollection = fs.existsSync(path.join(VALIDATOR_DIR, 'preflight_oidc.py'));
const skip = haveCollection ? false : `collection not found at ${COLLECTION}`;

const python = (args, input) => {
  const result = spawnSync('python3', args, { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

const DEFAULTED = ['grafana', 'bookstack', 'netbox', 'quay', 'minio', 'dev_hub'];
const ALL = [...DEFAULTED, 'gitlab'];

// Where each consumer's client id and "managed elsewhere" flag live in the form/JSON.
const SHAPES = {
  grafana: {
    setId: (cfg, id) => { cfg.oidc = { ...(cfg.oidc || {}), client_id: id }; },
    setIndependent: cfg => { cfg.oidc = { ...(cfg.oidc || {}), client_secret_manual: true }; }
  },
  bookstack: { setId: (cfg, id) => { cfg.oidc_client_id = id; } },
  netbox: { setId: (cfg, id) => { cfg.oidc_client_id = id; } },
  gitlab: { setId: (cfg, id) => { cfg.oidc_client_id = id; } },
  quay: {
    setId: (cfg, id) => { cfg.oidc_client_id = id; },
    setIndependent: cfg => { cfg.fetch_oidc_secret_from_rhbk = false; }
  },
  minio: {
    setId: (cfg, id) => { cfg.oidc_client_id = id; },
    setIndependent: cfg => { cfg.fetch_oidc_secret_from_rhbk = false; }
  },
  dev_hub: { setId: (cfg, id) => { cfg.keycloak_client_id = id; } }
};

function stateFor(component, { clientId = '', dismissed = [], present = [], independent = false }) {
  const cfg = {};
  SHAPES[component].setId(cfg, clientId);
  if (independent) SHAPES[component].setIndependent(cfg);
  return {
    component_options: { [component]: ['oidc'] },
    component_config: {
      [component]: cfg,
      rhbk: {
        clients: present.map(id => ({ id, name: id, redirect_uris: '', web_origins: '' })),
        clients_dismissed: dismissed
      }
    }
  };
}

const uiErrors = (state, selected) =>
  validateRhbkClientReferences(state, { isSelected: key => selected.includes(key) })
    .map(e => [e.component, e.kind, e.clientId])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

test('generated defaults equal components_defaults.yml in the collection', { skip }, () => {
  const fromCollection = JSON.parse(
    python([path.join(VALIDATOR_DIR, 'preflight_oidc.py'), '--print-default-client-ids'])
  );
  assert.deepEqual({ ...OIDC_DEFAULT_CLIENT_IDS }, fromCollection);
  assert.deepEqual(Object.keys(fromCollection).sort(), [...DEFAULTED].sort());
});

test('blank client id resolves the default for Grafana, BookStack, NetBox, Quay, MinIO, Dev Hub', () => {
  DEFAULTED.forEach(component => {
    for (const selected of [[component, 'rhbk'], [component]]) {
      assert.deepEqual(uiErrors(stateFor(component, {}), selected), [], `${component} ${selected}`);
    }
  });
});

test('a removed default client is never silently referenced through a blank id', () => {
  DEFAULTED.forEach(component => {
    const id = OIDC_DEFAULT_CLIENT_IDS[component];
    const state = stateFor(component, { dismissed: [id] });
    assert.deepEqual(uiErrors(state, [component, 'rhbk']), [[component, 'removed-client', id]]);
    // restored by the operator: valid again
    const restored = stateFor(component, { dismissed: [id], present: [id] });
    assert.deepEqual(uiErrors(restored, [component, 'rhbk']), []);
    // external Keycloak (no RHBK in the run): the local list is not consulted
    assert.deepEqual(uiErrors(state, [component]), []);
  });
});

test('GitLab and OpenShift have no default and need an explicit client id', () => {
  assert.equal(OIDC_DEFAULT_CLIENT_IDS.gitlab, undefined);
  assert.equal(OIDC_DEFAULT_CLIENT_IDS.openshift, undefined);
  assert.deepEqual(uiErrors(stateFor('gitlab', {}), ['gitlab', 'rhbk']).map(e => e[1]), ['no-client']);
  const openshift = {
    component_options: { openshift: ['oauth_rhbk'] },
    openshift: { oauth_rhbk: {} },
    component_config: { rhbk: {} }
  };
  assert.deepEqual(uiErrors(openshift, ['openshift', 'rhbk']).map(e => e[1]), ['no-client']);
  assert.deepEqual(uiErrors(openshift, ['openshift']).map(e => e[1]), ['no-client']);
});

test('UI and collection validators agree on every blank/default/removed combination', { skip }, () => {
  const cases = [];
  for (const component of ALL) {
    const dflt = OIDC_DEFAULT_CLIENT_IDS[component] || 'gitlab';
    for (const clientId of ['', 'custom-client', dflt]) {
      for (const dismissed of [[], [dflt]]) {
        for (const present of [[], [dflt], ['custom-client']]) {
          for (const independent of [false, ...(SHAPES[component].setIndependent ? [true] : [])]) {
            for (const withRhbk of [true, false]) {
              cases.push({
                component,
                selected: withRhbk ? [component, 'rhbk'] : [component],
                state: stateFor(component, { clientId, dismissed, present, independent })
              });
            }
          }
        }
      }
    }
  }
  const script = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(VALIDATOR_DIR)})`,
    'import preflight_oidc as P',
    'cases = json.load(sys.stdin)',
    'print(json.dumps([sorted([e["component"], e["kind"], e["clientId"]] for e in',
    '    P.validate_client_references(c["state"], set(c["selected"]))) for c in cases]))'
  ].join('\n');
  const cli = JSON.parse(python(['-c', script], JSON.stringify(cases)));
  assert.equal(cli.length, cases.length);
  let compared = 0;
  cases.forEach((c, i) => {
    const ui = uiErrors(c.state, c.selected);
    const sortedCli = cli[i].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.deepEqual(ui, sortedCli, `${c.component} ${JSON.stringify(c)}`);
    compared += 1;
  });
  assert.ok(compared > 300, `only ${compared} combinations compared`);
});

test('MinIO nested oidc.client_id is accepted as a legacy field', () => {
  const state = {
    component_options: { minio: ['oidc'] },
    component_config: {
      minio: { oidc_enabled: true, oidc: { client_id: 'minio-nested' } },
      rhbk: { clients: [{ id: 'minio-nested' }], clients_dismissed: [] }
    }
  };
  assert.deepEqual(uiErrors(state, ['minio', 'rhbk']), []);
  const dismissed = {
    ...state,
    component_config: {
      ...state.component_config,
      rhbk: { clients: [], clients_dismissed: ['minio-nested'] }
    }
  };
  assert.deepEqual(uiErrors(dismissed, ['minio', 'rhbk']).map(e => e[1]), ['removed-client']);
});

test('Developer Hub leftover oidc_client_id still validates like the canonical field', () => {
  const legacy = {
    component_options: { dev_hub: ['oidc'] },
    component_config: {
      dev_hub: { oidc_client_id: 'legacy-hub' },
      rhbk: { clients: [{ id: 'legacy-hub' }], clients_dismissed: [] }
    }
  };
  assert.deepEqual(uiErrors(legacy, ['dev_hub', 'rhbk']), []);
  const conflictDefault = {
    component_options: { dev_hub: ['oidc'] },
    component_config: {
      dev_hub: { keycloak_client_id: 'rhdh', oidc_client_id: 'my-rhdh' },
      rhbk: { clients: [{ id: 'my-rhdh' }], clients_dismissed: ['rhdh'] }
    }
  };
  assert.deepEqual(uiErrors(conflictDefault, ['dev_hub', 'rhbk']), []);
});
