import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyRhbkOidcClientPreset,
  autoAddRhbkClientPresets,
  formatRhbkClientErrors,
  rhbkOidcPresetShouldAutoAdd,
  normalizeDevHubClientFields,
  openshiftOauthRedirectUri,
  removeRhbkClientAt,
  resolveDevHubKeycloakClientId,
  resolveMinioOidcClientId,
  resolveOpenShiftOidcClientId,
  resolveOpenShiftOidcIdpName,
  rhbkClientIsManaged,
  syncOpenShiftClientRedirectUris,
  updateRhbkClientField,
  validateRhbkClientReferences
} from '../src/rhbkClients.mjs';

// Same shapes buildRhbkOidcClientPresets() in App.jsx emits for selected apps.
const preset = (key, id, origin) => ({
  key,
  client: {
    id,
    name: `${id} name`,
    redirect_uris: `${origin}/cb`,
    web_origins: origin,
    source: key
  }
});
const PRESETS = [
  preset('openshift', 'OpenshiftDev', 'https://oauth-openshift.apps.example.test'),
  preset('grafana', 'grafana-client', 'https://grafana.apps.example.test'),
  preset('gitlab', 'gitlab', 'https://gitlab.apps.example.test')
];

const clone = value => JSON.parse(JSON.stringify(value));
const ids = state => state.component_config.rhbk.clients.map(c => c.id);

// Form state as the effect + "Add all" leave it: three clients, app mirrors set.
function formWithThreeClients() {
  let state = {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk', 'grafana', 'gitlab'] },
    component_options: { rhbk: ['client'] },
    openshift: { oauth_rhbk: { client_id: 'OpenshiftDev' } },
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: { oidc: { enabled: true } },
      gitlab: {}
    }
  };
  PRESETS.forEach(p => { state = applyRhbkOidcClientPreset(state, p.client); });
  return state;
}

// What the UI does on X: clone prev, remove, return the new state.
const clickX = (state, index) => removeRhbkClientAt(clone(state), index);
// What the auto-add effect does on its next run (deps get new identities on every clone).
const effectRuns = (state, presets = PRESETS) => {
  const { copy, changed } = autoAddRhbkClientPresets(clone(state), presets);
  return changed ? copy : state;
};

test('fixture: three clients with mirrors', () => {
  const state = formWithThreeClients();
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client', 'gitlab']);
  assert.equal(state.component_config.gitlab.oidc_client_id, 'gitlab');
});

test('X removes only the selected client and leaves the others untouched', () => {
  const before = formWithThreeClients();
  const after = clickX(before, 2);
  assert.deepEqual(ids(after), ['OpenshiftDev', 'grafana-client']);
  assert.deepEqual(after.component_config.rhbk.clients[0], before.component_config.rhbk.clients[0]);
  assert.deepEqual(after.component_config.rhbk.clients[1], before.component_config.rhbk.clients[1]);
  assert.equal(after.component_config.grafana.oidc.client_id, 'grafana-client');
  assert.equal(after.component_config.rhbk.openshift_oidc_client_id, 'OpenshiftDev');
  assert.equal(before.component_config.rhbk.clients.length, 3, 'input state is not mutated');
});

test('removed client is not silently recreated when the auto-add effect re-runs', () => {
  const afterX = clickX(formWithThreeClients(), 2);
  const afterEffect = effectRuns(afterX);
  assert.deepEqual(ids(afterEffect), ['OpenshiftDev', 'grafana-client']);
});

test('removed client stays removed across later edits, JSON export/import and regenerate', () => {
  let state = clickX(formWithThreeClients(), 2);
  // unrelated edit that clones state and re-runs the effect
  state = effectRuns(clone(state));
  // export -> import (JSON round trip) -> effect runs on the imported form
  state = effectRuns(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client']);
  // another app gets selected: only the new client appears, the removed one does not
  const withNetbox = [...PRESETS, preset('netbox', 'netbox', 'https://netbox.apps.example.test')];
  state = effectRuns(state, withNetbox);
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client', 'netbox']);
});

test('exported JSON no longer lists the removed client or its mirrors', () => {
  const exported = JSON.parse(JSON.stringify(clickX(formWithThreeClients(), 2)));
  const rhbk = exported.component_config.rhbk;
  assert.ok(!rhbk.clients.some(c => c.id === 'gitlab'));
  assert.equal(exported.component_config.gitlab.oidc_client_id || '', '');
  assert.ok(!JSON.stringify({ ...rhbk, clients_dismissed: undefined }).includes('"gitlab"'));
});

test('mirrored OIDC refs are cleared only for the removed client', () => {
  const state = clickX(formWithThreeClients(), 0); // remove OpenshiftDev
  const rhbk = state.component_config.rhbk;
  assert.equal(rhbk.openshift_oidc_client_id || '', '');
  assert.equal(state.openshift.oauth_rhbk.client_id || '', '');
  // legacy single-client mirror follows the new first row
  assert.equal(rhbk.client, 'grafana-client');
  assert.equal(rhbk.client_name, 'grafana-client name');
  assert.equal(rhbk.client_redirect_uris, 'https://grafana.apps.example.test/cb');
  assert.equal(rhbk.client_web_origins, 'https://grafana.apps.example.test');
  // other components' refs are still valid and untouched
  assert.equal(state.component_config.grafana.oidc.client_id, 'grafana-client');
  assert.equal(state.component_config.gitlab.oidc_client_id, 'gitlab');
});

test('removing a client does not remove a client another selected component still needs', () => {
  let state = clickX(formWithThreeClients(), 1); // remove Grafana's client
  state = effectRuns(state);
  assert.deepEqual(ids(state), ['OpenshiftDev', 'gitlab']);
  assert.equal(state.component_config.gitlab.oidc_client_id, 'gitlab');
  assert.equal(state.component_config.rhbk.openshift_oidc_client_id, 'OpenshiftDev');
});

test('removing every client leaves one blank row and nothing re-adds them', () => {
  let state = formWithThreeClients();
  for (let i = 0; i < 3; i += 1) state = clickX(state, 0);
  state = effectRuns(state);
  assert.deepEqual(state.component_config.rhbk.clients, [
    { id: '', name: '', redirect_uris: '', web_origins: '' }
  ]);
  assert.equal(state.component_config.rhbk.client, '');
});

test('adding a removed client back from the preset menu works and stays', () => {
  let state = clickX(formWithThreeClients(), 2);
  state = applyRhbkOidcClientPreset(clone(state), PRESETS[2].client);
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client', 'gitlab']);
  state = effectRuns(state);
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client', 'gitlab']);
  // removing it again still sticks
  state = effectRuns(clickX(state, 2));
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client']);
});

test('removing a blank row does not suppress any app client', () => {
  let state = formWithThreeClients();
  state = applyRhbkOidcClientPreset(clone(state), { id: '', name: '', redirect_uris: '', web_origins: '' });
  state.component_config.rhbk.clients.push({ id: '', name: '', redirect_uris: '', web_origins: '' });
  const blankIndex = state.component_config.rhbk.clients.length - 1;
  state = effectRuns(clickX(state, blankIndex));
  assert.deepEqual(ids(state).filter(Boolean), ['OpenshiftDev', 'grafana-client', 'gitlab']);
});

// ---------------------------------------------------------------------------
// Required-client validation, OpenShift fallback guard, dismissal lifecycle
// ---------------------------------------------------------------------------

const blankRow = () => ({ id: '', name: '', redirect_uris: '', web_origins: '' });
const selectedKeys = (...keys) => key => keys.includes(key);
const LOCAL = selectedKeys('rhbk', 'openshift', 'grafana', 'gitlab');
const EXTERNAL = selectedKeys('openshift', 'grafana', 'gitlab'); // no RHBK in this run

// Three clients, Grafana + GitLab OIDC on, OpenShift OAuth against RHBK requested.
function activeForm() {
  const state = formWithThreeClients();
  state.component_options = {
    rhbk: ['client'],
    grafana: ['oidc'],
    openshift: ['oauth_rhbk']
  };
  return state;
}
const errorsFor = (state, isSelected = LOCAL) => validateRhbkClientReferences(state, { isSelected });
const errorOf = (errors, component) => errors.find(e => e.component === component);
const withGrafanaRefill = state => {
  // syncGrafanaOidcFromRhbk refills an empty Grafana client id with the default name.
  state.component_config.grafana.oidc.client_id = 'grafana-client';
  return state;
};

test('valid form has no OIDC client errors', () => {
  assert.deepEqual(errorsFor(activeForm()), []);
});

test('removing an actively referenced client reports the component and client', () => {
  const grafana = errorsFor(withGrafanaRefill(clickX(activeForm(), 1)));
  assert.equal(errorOf(grafana, 'grafana').kind, 'removed-client');
  assert.equal(errorOf(grafana, 'grafana').clientId, 'grafana-client');
  assert.match(errorOf(grafana, 'grafana').message, /Grafana OIDC still uses Keycloak client "grafana-client"/);

  const gitlab = errorsFor(clickX(activeForm(), 2));
  assert.equal(errorOf(gitlab, 'gitlab').kind, 'no-client');
  assert.match(errorOf(gitlab, 'gitlab').message, /GitLab OIDC is enabled but has no Keycloak client/);

  const openshift = errorsFor(clickX(activeForm(), 0));
  assert.equal(errorOf(openshift, 'openshift').kind, 'no-client');
  assert.match(errorOf(openshift, 'openshift').message, /OpenShift OIDC/);
  // removal itself is never refused
  assert.deepEqual(ids(clickX(activeForm(), 1)), ['OpenshiftDev', 'gitlab']);
});

test('a removed client can be replaced with a custom client without recreating the default', () => {
  let state = withGrafanaRefill(clickX(activeForm(), 1));
  assert.ok(errorOf(errorsFor(state), 'grafana'));
  state = clone(state);
  state.component_config.rhbk.clients.push(blankRow());
  const row = state.component_config.rhbk.clients.length - 1;
  state = updateRhbkClientField(clone(state), row, 'id', 'custom-grafana', PRESETS.map(p => p.client.id));
  state.component_config.grafana.oidc.client_id = 'custom-grafana';
  assert.deepEqual(errorsFor(state), []);
  state = effectRuns(state);
  assert.deepEqual(ids(state), ['OpenshiftDev', 'gitlab', 'custom-grafana']);
});

test('export/import keeps a dismissed client removed and the same validation result', () => {
  const before = withGrafanaRefill(clickX(activeForm(), 1));
  const imported = JSON.parse(JSON.stringify(before));
  assert.deepEqual(imported.component_config.rhbk.clients_dismissed, ['grafana-client']);
  assert.deepEqual(errorsFor(imported), errorsFor(before));
  assert.deepEqual(ids(effectRuns(imported)), ['OpenshiftDev', 'gitlab']);
});

test('OpenShift never falls back to the first Keycloak client', () => {
  const state = clickX(activeForm(), 0); // Grafana is now the first row
  assert.equal(state.component_config.rhbk.client, 'grafana-client');
  assert.equal(resolveOpenShiftOidcClientId(state), '');
  const error = errorOf(errorsFor(state), 'openshift');
  assert.equal(error.kind, 'no-client');
  assert.equal(error.clientId, '');
});

test('OpenShift resolves an explicit or OpenShift-specific client only', () => {
  const state = clickX(activeForm(), 0);
  state.openshift.oauth_rhbk.client_id = 'MyOpenShiftClient';
  assert.equal(resolveOpenShiftOidcClientId(state), 'MyOpenShiftClient');
  state.openshift.oauth_rhbk.client_id = '';
  state.component_config.rhbk.openshift_oidc_client_id = 'FromRhbk';
  assert.equal(resolveOpenShiftOidcClientId(state), 'FromRhbk');
  state.component_config.rhbk.openshift_oidc_client_id = '';
  state.component_config.rhbk.clients.push({ id: 'openshift-prod', name: 'x', redirect_uris: '', web_origins: '' });
  assert.equal(resolveOpenShiftOidcClientId(state), 'openshift-prod');
});

test('explicit external Keycloak client does not need a local client entry', () => {
  const state = activeForm();
  state.component_config.rhbk.clients = [blankRow()];
  state.component_config.rhbk.client = '';
  state.component_config.grafana.oidc.client_id = 'corp-grafana';
  state.component_config.gitlab.oidc_client_id = 'corp-gitlab';
  state.openshift.oauth_rhbk.client_id = 'corp-openshift';
  state.component_config.rhbk.openshift_oidc_client_id = '';
  assert.deepEqual(errorsFor(state, EXTERNAL), []);
  // a blank id uses the framework default client (grafana-client), which is allowed
  state.component_config.grafana.oidc.client_id = '';
  assert.equal(errorOf(errorsFor(state, EXTERNAL), 'grafana'), undefined);
  // components without a default still need an explicit id
  state.component_config.gitlab.oidc_client_id = '';
  const missing = errorOf(errorsFor(state, EXTERNAL), 'gitlab');
  assert.equal(missing.kind, 'no-client');
  assert.match(missing.message, /externally managed Keycloak client/);
});

test('a component can opt out with its existing "managed elsewhere" flag even with RHBK selected', () => {
  const state = clickX(withGrafanaRefill(activeForm()), 1);
  state.component_config.grafana.oidc.client_id = 'grafana-client';
  assert.ok(errorOf(errorsFor(state), 'grafana'));
  state.component_config.grafana.oidc.client_secret_manual = true;
  assert.equal(errorOf(errorsFor(state), 'grafana'), undefined);
  state.component_config.grafana.oidc.client_secret_manual = false;
  state.component_config.grafana.oidc.enabled = false; // integration disabled
  assert.equal(errorOf(errorsFor(state), 'grafana'), undefined);
});

test('invalid OIDC configuration blocks generation but not editing or export', () => {
  const state = withGrafanaRefill(clickX(activeForm(), 1));
  const errors = errorsFor(state);
  const canRun = errors.length === 0;
  assert.equal(canRun, false);
  const message = formatRhbkClientErrors(errors);
  assert.match(message, /Grafana OIDC still uses Keycloak client "grafana-client"/);
  // the form can still be exported and edited
  assert.doesNotThrow(() => JSON.stringify(state));
  state.component_config.grafana.oidc.enabled = false;
  assert.equal(errorsFor(state).length, 0);
});

test('selecting GitLab again does not restore an unused Keycloak client', () => {
  let state = clickX(activeForm(), 2); // remove GitLab's leftover client
  const withoutGitlab = PRESETS.filter(p => p.key !== 'gitlab');
  const pruned = autoAddRhbkClientPresets(clone(state), withoutGitlab, { prune: true });
  assert.equal(pruned.copy.component_config.rhbk.clients_dismissed, undefined);
  assert.deepEqual(ids(pruned.copy), ['OpenshiftDev', 'grafana-client']);
  const again = autoAddRhbkClientPresets(clone(pruned.copy), PRESETS, { prune: true });
  assert.deepEqual(ids(again.copy), ['OpenshiftDev', 'grafana-client']);
  assert.ok(!ids(again.copy).includes('gitlab'));
});

test('disable then re-enable BookStack restores its default client once', () => {
  const bookstack = preset('bookstack', 'bookstack', 'https://bookstack.apps.example.test');
  const withBookstack = [PRESETS[0], PRESETS[1], bookstack];
  let state = {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk', 'grafana', 'bookstack'] },
    component_options: { rhbk: ['client'] },
    openshift: { oauth_rhbk: { client_id: 'OpenshiftDev' } },
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: { oidc: { enabled: true } },
      bookstack: {}
    }
  };
  withBookstack.forEach(p => { state = applyRhbkOidcClientPreset(state, p.client); });
  state = clickX(state, 2);
  const without = withBookstack.filter(p => p.key !== 'bookstack');
  const pruned = autoAddRhbkClientPresets(clone(state), without, { prune: true });
  assert.equal(pruned.copy.component_config.rhbk.clients_dismissed, undefined);
  const again = autoAddRhbkClientPresets(clone(pruned.copy), withBookstack, { prune: true });
  assert.deepEqual(ids(again.copy), ['OpenshiftDev', 'grafana-client', 'bookstack']);
  assert.equal(
    autoAddRhbkClientPresets(clone(again.copy), withBookstack, { prune: true }).changed,
    false
  );
});

test('dismissals survive while the apps domain is unknown (nothing is offered)', () => {
  const state = clickX(activeForm(), 2);
  const result = autoAddRhbkClientPresets(clone(state), [], { prune: false });
  assert.deepEqual(result.copy.component_config.rhbk.clients_dismissed, ['gitlab']);
});

test('changing a generated client id dismisses the old id and leaves no obsolete entries', () => {
  const presetIds = PRESETS.map(p => p.client.id);
  let state = activeForm();
  // type a new id over GitLab's client one keystroke at a time
  ['gitlab-', 'gitlab-c', 'gitlab-custom'].forEach(value => {
    state = updateRhbkClientField(clone(state), 2, 'id', value, presetIds);
  });
  assert.deepEqual(state.component_config.rhbk.clients_dismissed, ['gitlab']);
  assert.deepEqual(ids(effectRuns(state)), ['OpenshiftDev', 'grafana-client', 'gitlab-custom']);
  // typing the default id back drops the dismissal entirely
  state = updateRhbkClientField(clone(state), 2, 'id', 'gitlab', presetIds);
  assert.equal(state.component_config.rhbk.clients_dismissed, undefined);
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client', 'gitlab']);
});

test('editing a non-generated client id never records a dismissal', () => {
  const presetIds = PRESETS.map(p => p.client.id);
  let state = activeForm();
  state.component_config.rhbk.clients.push({ id: 'mine', name: '', redirect_uris: '', web_origins: '' });
  state = updateRhbkClientField(clone(state), 3, 'id', 'mine-2', presetIds);
  assert.equal(state.component_config.rhbk.clients_dismissed, undefined);
});

test('create_client missing or true means managed; false means existing', () => {
  assert.equal(rhbkClientIsManaged({}), true);
  assert.equal(rhbkClientIsManaged({ create_client: true }), true);
  assert.equal(rhbkClientIsManaged({ create_client: false }), false);
  assert.equal(rhbkClientIsManaged({ create_client: 'no' }), false);
  assert.equal(rhbkClientIsManaged({ create_client: '' }), true);
});

test('unmanaged existing client keeps the row, app OIDC, and does not need dismiss', () => {
  let state = activeForm();
  state = updateRhbkClientField(clone(state), 0, 'create_client', false, PRESETS.map(p => p.client.id));
  assert.equal(rhbkClientIsManaged(state.component_config.rhbk.clients[0]), false);
  assert.equal(state.openshift.oauth_rhbk.client_id, 'OpenshiftDev');
  assert.equal(state.component_config.rhbk.openshift_oidc_client_id, 'OpenshiftDev');
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client', 'gitlab']);
  assert.equal(state.component_config.rhbk.clients_dismissed, undefined);
  assert.deepEqual(errorsFor(state), []);
});

test('auto-add and JSON round-trip do not flip an unmanaged client back to managed', () => {
  let state = activeForm();
  state = updateRhbkClientField(clone(state), 0, 'create_client', false, PRESETS.map(p => p.client.id));
  state = effectRuns(state);
  assert.equal(state.component_config.rhbk.clients[0].create_client, false);
  const imported = JSON.parse(JSON.stringify(state));
  const afterImport = effectRuns(imported);
  assert.equal(afterImport.component_config.rhbk.clients[0].create_client, false);
  assert.equal(rhbkClientIsManaged(afterImport.component_config.rhbk.clients[0]), false);
  assert.deepEqual(ids(afterImport), ['OpenshiftDev', 'grafana-client', 'gitlab']);
  assert.equal(afterImport.openshift.oauth_rhbk.client_id, 'OpenshiftDev');
});

test('re-adding a preset does not reset create_client on an existing unmanaged row', () => {
  let state = activeForm();
  state = updateRhbkClientField(clone(state), 1, 'create_client', false, PRESETS.map(p => p.client.id));
  state = applyRhbkOidcClientPreset(clone(state), PRESETS[1].client);
  assert.equal(state.component_config.rhbk.clients[1].create_client, false);
  assert.equal(state.component_config.grafana.oidc.client_id, 'grafana-client');
});

test('legacy export without create_client stays valid and managed', () => {
  const legacy = JSON.parse(JSON.stringify(activeForm()));
  legacy.component_config.rhbk.clients.forEach(row => {
    assert.equal('create_client' in row, false);
    assert.equal(rhbkClientIsManaged(row), true);
  });
  assert.deepEqual(errorsFor(legacy), []);
  assert.deepEqual(ids(effectRuns(legacy)), ['OpenshiftDev', 'grafana-client', 'gitlab']);
});

test('mixed ownership: Grafana managed, OpenShift existing, no dismiss required', () => {
  let state = activeForm();
  state = updateRhbkClientField(clone(state), 0, 'create_client', false, PRESETS.map(p => p.client.id));
  assert.equal(rhbkClientIsManaged(state.component_config.rhbk.clients[0]), false);
  assert.equal(rhbkClientIsManaged(state.component_config.rhbk.clients[1]), true);
  assert.equal(state.component_config.grafana.oidc.client_id, 'grafana-client');
  assert.equal(resolveOpenShiftOidcClientId(state), 'OpenshiftDev');
  assert.deepEqual(errorsFor(state), []);
});

test('MinIO resolver prefers oidc_client_id over nested oidc.client_id', () => {
  assert.equal(resolveMinioOidcClientId({
    component_config: { minio: { oidc_client_id: 'minio-ui', oidc: { client_id: 'minio-nested' } } }
  }), 'minio-ui');
  assert.equal(resolveMinioOidcClientId({
    component_config: { minio: { oidc: { client_id: 'minio-nested' } } }
  }), 'minio-nested');
});

test('Developer Hub preset writes keycloak_client_id and drops leftover oidc_client_id', () => {
  let state = { component_config: { rhbk: { clients: [] }, dev_hub: { oidc_client_id: 'stale' } } };
  state = applyRhbkOidcClientPreset(state, {
    id: 'rhdh',
    name: 'Developer Hub',
    redirect_uris: 'https://backstage.apps.example.test/cb',
    web_origins: 'https://backstage.apps.example.test',
    source: 'dev_hub'
  });
  assert.equal(state.component_config.dev_hub.keycloak_client_id, 'rhdh');
  assert.equal(state.component_config.dev_hub.oidc_client_id, undefined);
});

test('Developer Hub import/export collapses leftover oidc_client_id onto keycloak_client_id', () => {
  const legacy = normalizeDevHubClientFields({
    component_config: { dev_hub: { oidc_client_id: 'legacy-hub' } }
  });
  assert.equal(legacy.component_config.dev_hub.keycloak_client_id, 'legacy-hub');
  assert.equal(legacy.component_config.dev_hub.oidc_client_id, undefined);

  const defaultVsCustom = normalizeDevHubClientFields({
    component_config: { dev_hub: { keycloak_client_id: 'rhdh', oidc_client_id: 'my-rhdh' } }
  });
  assert.equal(defaultVsCustom.component_config.dev_hub.keycloak_client_id, 'my-rhdh');
  assert.equal(defaultVsCustom.component_config.dev_hub.oidc_client_id, undefined);

  const bothCustom = normalizeDevHubClientFields({
    component_config: { dev_hub: { keycloak_client_id: 'hub-a', oidc_client_id: 'hub-b' } }
  });
  assert.equal(bothCustom.component_config.dev_hub.keycloak_client_id, 'hub-a');
  assert.equal(bothCustom.component_config.dev_hub.oidc_client_id, undefined);
  assert.equal(resolveDevHubKeycloakClientId(bothCustom), 'hub-a');
});

test('GitLab presets are not auto-added even when offered', () => {
  assert.equal(rhbkOidcPresetShouldAutoAdd(PRESETS.find(p => p.key === 'gitlab')), false);
  assert.equal(rhbkOidcPresetShouldAutoAdd(PRESETS.find(p => p.key === 'grafana')), true);
  let state = {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk', 'grafana', 'gitlab'] },
    component_options: { rhbk: ['client'] },
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: {},
      gitlab: {}
    }
  };
  const { copy } = autoAddRhbkClientPresets(state, PRESETS);
  assert.deepEqual(ids(copy), ['OpenshiftDev', 'grafana-client']);
  assert.equal(copy.component_config.gitlab.oidc_client_id || '', '');
  assert.notEqual(copy.component_config.gitlab.oidc_enabled, true);
});

test('existing GitLab client rows stay in JSON and are not deleted by auto-add', () => {
  const state = formWithThreeClients();
  assert.deepEqual(ids(state), ['OpenshiftDev', 'grafana-client', 'gitlab']);
  const after = effectRuns(state);
  assert.deepEqual(ids(after), ['OpenshiftDev', 'grafana-client', 'gitlab']);
  assert.equal(after.component_config.gitlab.oidc_client_id, 'gitlab');
});

test('GitLab selected without oidc_enabled does not require a Keycloak client', () => {
  const state = {
    component_options: { rhbk: ['client'] },
    component_config: {
      gitlab: {},
      rhbk: { clients: [{ id: 'grafana-client', name: 'Grafana', redirect_uris: '', web_origins: '' }] }
    }
  };
  assert.deepEqual(errorsFor(state, selectedKeys('rhbk', 'gitlab', 'grafana')), []);
});

test('mixed Grafana, BookStack, NetBox, and GitLab auto-add skips only GitLab', () => {
  const extra = [
    preset('bookstack', 'bookstack', 'https://bookstack.apps.example.test'),
    preset('netbox', 'netbox', 'https://netbox.apps.example.test')
  ];
  let state = {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk', 'grafana', 'bookstack', 'netbox', 'gitlab'] },
    component_options: { rhbk: ['client'] },
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: {},
      bookstack: {},
      netbox: {},
      gitlab: {}
    }
  };
  const { copy } = autoAddRhbkClientPresets(state, [...PRESETS, ...extra]);
  assert.deepEqual(ids(copy), ['OpenshiftDev', 'grafana-client', 'bookstack', 'netbox']);
  assert.ok(!ids(copy).includes('gitlab'));
});

test('OpenShift redirect URI uses default IdP name Keycloak', () => {
  assert.equal(
    openshiftOauthRedirectUri('apps.example.test', ''),
    'https://oauth-openshift.apps.example.test/oauth2callback/Keycloak'
  );
  assert.equal(resolveOpenShiftOidcIdpName({}), 'Keycloak');
});

test('OpenShift redirect URI uses custom IdP name', () => {
  const state = {
    openshift: {
      apps_domain: 'apps.example.test',
      oauth_rhbk: { idp_name: 'Corp-SSO', client_id: 'OpenshiftDev' }
    },
    component_config: {
      rhbk: {
        clients: [{
          id: 'OpenshiftDev',
          source: 'openshift',
          redirect_uris: 'https://oauth-openshift.apps.example.test/oauth2callback/Keycloak/*',
          web_origins: 'https://oauth-openshift.apps.example.test'
        }]
      }
    }
  };
  assert.equal(resolveOpenShiftOidcIdpName(state), 'Corp-SSO');
  const { copy, changed } = syncOpenShiftClientRedirectUris(state);
  assert.equal(changed, true);
  assert.equal(
    copy.component_config.rhbk.clients[0].redirect_uris,
    'https://oauth-openshift.apps.example.test/oauth2callback/Corp-SSO'
  );
  const imported = JSON.parse(JSON.stringify(copy));
  assert.equal(imported.openshift.oauth_rhbk.idp_name, 'Corp-SSO');
  assert.equal(
    imported.component_config.rhbk.clients[0].redirect_uris,
    'https://oauth-openshift.apps.example.test/oauth2callback/Corp-SSO'
  );
});

test('custom non-callback OpenShift redirect URIs are left unchanged', () => {
  const state = {
    openshift: { apps_domain: 'apps.example.test', oauth_rhbk: { idp_name: 'Corp-SSO' } },
    component_config: {
      rhbk: {
        clients: [{
          id: 'OpenshiftDev',
          source: 'openshift',
          redirect_uris: 'https://oauth.apps.example.test/*',
          web_origins: 'https://oauth.apps.example.test'
        }]
      }
    }
  };
  const { changed } = syncOpenShiftClientRedirectUris(state);
  assert.equal(changed, false);
});

test('Grafana presets are not auto-added when OIDC is explicitly disabled', () => {
  assert.equal(rhbkOidcPresetShouldAutoAdd(PRESETS.find(p => p.key === 'grafana')), true);
  const state = {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk', 'grafana'] },
    component_options: { rhbk: ['client'], grafana: ['oidc'] },
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: { oidc: { enabled: false } }
    }
  };
  assert.equal(rhbkOidcPresetShouldAutoAdd(PRESETS.find(p => p.key === 'grafana'), state), false);
  const { copy } = autoAddRhbkClientPresets(state, PRESETS);
  assert.deepEqual(ids(copy), ['OpenshiftDev']);
  assert.ok(!ids(copy).includes('grafana-client'));
});

test('Grafana presets are auto-added when OIDC enabled is true or absent', () => {
  const enabled = {
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: { oidc: { enabled: true } }
    }
  };
  const absent = {
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: { oidc: {} }
    }
  };
  const on = autoAddRhbkClientPresets(enabled, PRESETS);
  const missing = autoAddRhbkClientPresets(absent, PRESETS);
  assert.deepEqual(ids(on.copy), ['OpenshiftDev', 'grafana-client']);
  assert.deepEqual(ids(missing.copy), ['OpenshiftDev', 'grafana-client']);
});

test('mixed Grafana OpenShift BookStack MinIO auto-add honors Grafana disable', () => {
  const extra = [
    preset('bookstack', 'bookstack', 'https://bookstack.apps.example.test'),
    preset('minio', 'minio', 'https://minio.apps.example.test')
  ];
  const state = {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk', 'grafana', 'bookstack', 'minio'] },
    component_options: { rhbk: ['client'], grafana: ['oidc'] },
    openshift: { oauth_rhbk: { client_id: 'OpenshiftDev' } },
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: { oidc: { enabled: false } },
      bookstack: {},
      minio: {}
    }
  };
  const { copy } = autoAddRhbkClientPresets(state, [...PRESETS, ...extra]);
  assert.deepEqual(ids(copy), ['OpenshiftDev', 'bookstack', 'minio']);
  assert.ok(!ids(copy).includes('grafana-client'));
  assert.ok(!ids(copy).includes('gitlab'));
});

test('389ds + Grafana + RHBK auto-add gives Grafana a client and 389ds none', () => {
  const presets = [
    preset('openshift', 'OpenshiftDev', 'https://oauth-openshift.apps.example.test'),
    preset('grafana', 'grafana-client', 'https://grafana.apps.example.test')
  ];
  const state = {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk', 'grafana', 'dirsrv'] },
    component_options: { rhbk: ['client'], grafana: ['oidc'] },
    openshift: { oauth_rhbk: { client_id: 'OpenshiftDev' } },
    component_config: {
      rhbk: { clients: [{ id: '', name: '', redirect_uris: '', web_origins: '' }] },
      grafana: { oidc: { enabled: true } },
      dirsrv: { hostname: 'dirsrv.apps.example.test' }
    }
  };
  const { copy } = autoAddRhbkClientPresets(state, presets);
  assert.deepEqual(ids(copy), ['OpenshiftDev', 'grafana-client']);
  assert.equal(copy.component_config.grafana.oidc.client_id, 'grafana-client');
  assert.ok(!ids(copy).some(id => /dirsrv|389ds|389|ldap/i.test(id)));
  assert.equal(copy.component_config.dirsrv.oidc_client_id, undefined);
});

test('buildRhbkOidcClientPresets in App.jsx does not offer a 389ds client', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('function buildRhbkOidcClientPresets');
  assert.notEqual(start, -1);
  const end = app.indexOf('\nfunction ', start + 1);
  const fn = app.slice(start, end);
  assert.match(fn, /key: 'grafana'/);
  assert.equal(fn.includes("key: 'dirsrv'"), false);
  assert.equal(fn.includes("source: 'dirsrv'"), false);
  assert.equal(fn.includes('389ds'), false);
});
