import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  openShiftVerifySsl,
  openshiftOauthRedirectUri,
  resolveOpenShiftOauthSettings,
  resolveOpenShiftOidcIdpName,
  validateOidcInputs,
  validateOpenShiftOauthSettings,
  validateRhbkClientReferences
} from '../src/rhbkClients.mjs';

// OpenShift OIDC with RHBK in the run, and against an existing (external) Keycloak.
// Mirrors preflight_oidc.py; the ADO collection tests run the same scenarios.

const clone = value => JSON.parse(JSON.stringify(value));
const selected = (...keys) => key => keys.includes(key);
const WITH_RHBK = { isSelected: selected('openshift', 'rhbk') };
const NO_RHBK = { isSelected: selected('openshift') };
const kinds = errors => errors.map(error => error.kind).sort();

const OPENSHIFT_ROW = { id: 'OpenshiftDev', name: 'OpenShift', redirect_uris: '', web_origins: '' };
const GRAFANA_ROW = { id: 'grafana-client', name: 'Grafana', redirect_uris: '', web_origins: '' };

function rhbkRun(overrides = {}) {
  return {
    components: ['openshift'],
    component_apps: { openshift: ['rhbk'] },
    component_options: { openshift: ['oauth_rhbk'], rhbk: ['client'] },
    openshift: {
      apps_domain: 'apps.example.test',
      oauth_rhbk: { idp_name: 'Keycloak', client_id: 'OpenshiftDev', mapping_method: 'claim' }
    },
    component_config: {
      rhbk: {
        hostname: 'keycloak.apps.example.test',
        realm: 'demo',
        admin_user: 'admin',
        admin_password: 'rhbk-pass',
        clients: [clone(GRAFANA_ROW), clone(OPENSHIFT_ROW)]
      }
    },
    ...overrides
  };
}

function externalRun(oauth = {}) {
  return {
    components: ['openshift'],
    component_apps: { openshift: [] },
    component_options: { openshift: ['oauth_rhbk'] },
    openshift: {
      apps_domain: 'apps.example.test',
      oauth_rhbk: {
        idp_name: 'Corp-SSO',
        keycloak_hostname: 'sso.corp.example.test',
        realm: 'corp',
        client_id: 'corp-openshift',
        admin_user: 'kcadmin',
        admin_password: 'external-pass',
        mapping_method: 'claim',
        ...oauth
      }
    },
    component_config: {}
  };
}

// 1. RHBK selected -----------------------------------------------------------

test('RHBK selected: host, realm and credentials are inherited', () => {
  const settings = resolveOpenShiftOauthSettings(rhbkRun(), WITH_RHBK);
  assert.equal(settings.mode, 'rhbk');
  assert.equal(settings.hostname, 'keycloak.apps.example.test');
  assert.equal(settings.realm, 'demo');
  assert.equal(settings.adminUser, 'admin');
  assert.equal(settings.adminPasswordSource, 'rhbk');
  assert.equal(settings.clientId, 'OpenshiftDev');
  assert.deepEqual(validateOidcInputs(rhbkRun(), WITH_RHBK), []);
});

test('RHBK selected without an RHBK hostname derives keycloak.<apps domain>', () => {
  const state = rhbkRun();
  state.component_config.rhbk.hostname = '';
  assert.equal(resolveOpenShiftOauthSettings(state, WITH_RHBK).hostname, 'keycloak.apps.example.test');
});

test('RHBK selected: explicit OpenShift values override the inherited ones', () => {
  const state = rhbkRun();
  Object.assign(state.openshift.oauth_rhbk, {
    keycloak_hostname: 'https://kc2.example.test/',
    realm: 'other',
    admin_user: 'otheradmin',
    admin_password: 'other-pass'
  });
  const settings = resolveOpenShiftOauthSettings(state, WITH_RHBK);
  assert.equal(settings.hostname, 'kc2.example.test');
  assert.equal(settings.realm, 'other');
  assert.equal(settings.adminUser, 'otheradmin');
  assert.equal(settings.adminPasswordSource, 'openshift');
  assert.deepEqual(validateOpenShiftOauthSettings(state, WITH_RHBK), []);
});

// 2. External Keycloak only --------------------------------------------------

test('external Keycloak: complete OpenShift section is valid without RHBK', () => {
  const state = externalRun();
  const settings = resolveOpenShiftOauthSettings(state, NO_RHBK);
  assert.equal(settings.mode, 'external');
  assert.equal(settings.hostname, 'sso.corp.example.test');
  assert.equal(settings.adminPasswordSource, 'openshift');
  assert.deepEqual(validateOidcInputs(state, NO_RHBK), []);
});

test('external Keycloak ignores a leftover RHBK form that is not in the run', () => {
  const state = externalRun({ keycloak_hostname: '', realm: '' });
  state.component_config.rhbk = {
    hostname: 'keycloak.stale.example.test', realm: 'stale', admin_user: 'x', admin_password: 'y'
  };
  const settings = resolveOpenShiftOauthSettings(state, NO_RHBK);
  assert.equal(settings.hostname, '');
  assert.equal(settings.realm, '');
  assert.deepEqual(kinds(validateOpenShiftOauthSettings(state, NO_RHBK)), ['missing-hostname', 'missing-realm']);
});

// 3. Client ID precedence ------------------------------------------------------

test('explicit OpenShift client id beats the RHBK field and the client list', () => {
  const state = rhbkRun();
  state.openshift.oauth_rhbk.client_id = 'FromOauth';
  state.component_config.rhbk.openshift_oidc_client_id = 'FromRhbk';
  assert.equal(resolveOpenShiftOauthSettings(state, WITH_RHBK).clientId, 'FromOauth');
  state.openshift.oauth_rhbk.client_id = '';
  assert.equal(resolveOpenShiftOauthSettings(state, WITH_RHBK).clientId, 'FromRhbk');
  state.component_config.rhbk.openshift_oidc_client_id = '';
  assert.equal(resolveOpenShiftOauthSettings(state, WITH_RHBK).clientId, 'OpenshiftDev');
});

// 4. Missing or conflicting inputs --------------------------------------------

test('external mode requires every connection input', () => {
  const expected = {
    keycloak_hostname: 'missing-hostname',
    realm: 'missing-realm',
    admin_user: 'missing-admin-user',
    admin_password: 'missing-admin-password'
  };
  Object.entries(expected).forEach(([field, kind]) => {
    const errors = validateOpenShiftOauthSettings(externalRun({ [field]: '' }), NO_RHBK);
    assert.deepEqual(kinds(errors), [kind], field);
  });
  const noClient = validateRhbkClientReferences(externalRun({ client_id: '' }), NO_RHBK);
  assert.equal(noClient[0].kind, 'no-client');
  assert.match(noClient[0].message, /externally managed Keycloak client but no client ID/);
});

test('RHBK selected: no admin password anywhere is an error', () => {
  const state = rhbkRun();
  state.component_config.rhbk.admin_password = '';
  assert.deepEqual(kinds(validateOpenShiftOauthSettings(state, WITH_RHBK)), ['missing-admin-password']);
});

test('a different Keycloak host needs its own admin credentials', () => {
  const state = rhbkRun();
  state.openshift.oauth_rhbk.keycloak_hostname = 'kc2.example.test';
  assert.deepEqual(kinds(validateOpenShiftOauthSettings(state, WITH_RHBK)), ['credential-host-mismatch']);
  state.openshift.oauth_rhbk.admin_password = 'other-pass';
  assert.deepEqual(kinds(validateOpenShiftOauthSettings(state, WITH_RHBK)), ['credential-host-mismatch']);
  state.openshift.oauth_rhbk.admin_user = 'otheradmin';
  assert.deepEqual(validateOpenShiftOauthSettings(state, WITH_RHBK), []);
});

test('the RHBK host written as a URL is not a conflict', () => {
  const state = rhbkRun();
  state.openshift.oauth_rhbk.keycloak_hostname = 'https://Keycloak.apps.example.test/auth';
  assert.deepEqual(validateOpenShiftOauthSettings(state, WITH_RHBK), []);
});

test('invalid host name and mapping method are rejected', () => {
  assert.deepEqual(
    kinds(validateOpenShiftOauthSettings(externalRun({ keycloak_hostname: 'sso corp' }), NO_RHBK)),
    ['invalid-hostname']
  );
  assert.deepEqual(
    kinds(validateOpenShiftOauthSettings(externalRun({ mapping_method: 'bogus' }), NO_RHBK)),
    ['invalid-mapping-method']
  );
});

test('nothing is validated when OpenShift OIDC was not requested', () => {
  const state = externalRun({ keycloak_hostname: '', realm: '', admin_password: '' });
  state.component_options.openshift = [];
  assert.deepEqual(validateOidcInputs(state, NO_RHBK), []);
  assert.deepEqual(validateOidcInputs(externalRun({ realm: '' }), { isSelected: selected('rhbk') }), []);
});

// 5. Several OIDC consumers ----------------------------------------------------

test('Grafana and OpenShift keep their own clients', () => {
  const state = rhbkRun();
  state.component_apps.openshift = ['rhbk', 'grafana'];
  state.component_options.grafana = ['oidc'];
  state.component_config.grafana = { oidc: { enabled: true, client_id: 'grafana-client' } };
  const isSelected = selected('openshift', 'rhbk', 'grafana');
  assert.equal(resolveOpenShiftOauthSettings(state, { isSelected }).clientId, 'OpenshiftDev');
  assert.deepEqual(validateOidcInputs(state, { isSelected }), []);
});

// 6. Removed / dismissed clients ----------------------------------------------

test('a removed OpenShift client blocks while RHBK manages clients, not for an external one', () => {
  const local = rhbkRun();
  local.component_config.rhbk.clients = [clone(GRAFANA_ROW)];
  local.component_config.rhbk.clients_dismissed = ['OpenshiftDev'];
  const localErrors = validateOidcInputs(local, WITH_RHBK);
  assert.deepEqual(kinds(localErrors), ['removed-client']);
  assert.match(localErrors[0].message, /OpenShift OIDC still uses Keycloak client "OpenshiftDev"/);

  const external = externalRun({ client_id: 'OpenshiftDev' });
  external.component_config.rhbk = { clients_dismissed: ['OpenshiftDev'] };
  assert.deepEqual(validateOidcInputs(external, NO_RHBK), []);
});

// 7. JSON export / import -------------------------------------------------------

test('export then import yields the same validation result and settings', () => {
  [rhbkRun(), externalRun(), externalRun({ admin_password: '' })].forEach(state => {
    const imported = JSON.parse(JSON.stringify(state));
    const selection = state.component_apps.openshift.includes('rhbk') ? WITH_RHBK : NO_RHBK;
    assert.deepEqual(validateOidcInputs(imported, selection), validateOidcInputs(state, selection));
    assert.deepEqual(
      resolveOpenShiftOauthSettings(imported, selection),
      resolveOpenShiftOauthSettings(state, selection)
    );
    assert.equal(
      resolveOpenShiftOidcIdpName(imported),
      resolveOpenShiftOauthSettings(imported, selection).idpName
    );
  });
});

test('Preflight help documents the exact OpenShift callback, not a trailing wildcard', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.equal(app.includes('oauth2callback/*'), false);
  assert.match(
    app,
    /exact callback https:\/\/oauth-openshift\.<apps_domain>\/oauth2callback\/<IdP name> with no trailing \/\*/
  );
  assert.match(app, /exact callback \/oauth2callback\/&lt;IdP name&gt;/);
});

test('default and custom IdP names produce matching OAuth callback URIs', () => {
  assert.equal(resolveOpenShiftOauthSettings(rhbkRun(), WITH_RHBK).idpName, 'Keycloak');
  assert.equal(
    openshiftOauthRedirectUri('apps.example.test', 'Keycloak'),
    'https://oauth-openshift.apps.example.test/oauth2callback/Keycloak'
  );
  const custom = rhbkRun();
  custom.openshift.oauth_rhbk.idp_name = 'Corp-SSO';
  const imported = JSON.parse(JSON.stringify(custom));
  assert.equal(resolveOpenShiftOauthSettings(imported, WITH_RHBK).idpName, 'Corp-SSO');
  assert.equal(
    openshiftOauthRedirectUri(imported.openshift.apps_domain, 'Corp-SSO'),
    'https://oauth-openshift.apps.example.test/oauth2callback/Corp-SSO'
  );
});

// 9. No plaintext secret leakage -------------------------------------------------

test('validation messages and effective settings never contain a password', () => {
  const state = externalRun({ keycloak_hostname: '' });
  const settings = resolveOpenShiftOauthSettings(state, NO_RHBK);
  assert.equal(JSON.stringify(settings).includes('external-pass'), false);
  const messages = validateOidcInputs(state, NO_RHBK).map(error => error.message).join('\n');
  assert.equal(messages.includes('external-pass'), false);
});

// 10. Keycloak TLS verification is ON unless explicitly turned off ---------------

test('TLS verification defaults to on in both modes', () => {
  assert.equal(resolveOpenShiftOauthSettings(rhbkRun(), WITH_RHBK).verifySsl, true);
  assert.equal(resolveOpenShiftOauthSettings(externalRun(), NO_RHBK).verifySsl, true);
});

test('blank / null / missing verify_ssl means verify', () => {
  [undefined, null, ''].forEach(value => {
    assert.equal(openShiftVerifySsl({ verify_ssl: value }), true);
    assert.equal(resolveOpenShiftOauthSettings(externalRun({ verify_ssl: value }), NO_RHBK).verifySsl, true);
  });
  assert.equal(openShiftVerifySsl(undefined), true);
  assert.equal(openShiftVerifySsl({}), true);
});

test('an explicit verify_ssl: false is honored in both modes', () => {
  const rhbk = rhbkRun();
  rhbk.openshift.oauth_rhbk.verify_ssl = false;
  assert.equal(resolveOpenShiftOauthSettings(rhbk, WITH_RHBK).verifySsl, false);
  assert.equal(resolveOpenShiftOauthSettings(externalRun({ verify_ssl: false }), NO_RHBK).verifySsl, false);
  assert.equal(openShiftVerifySsl({ verify_ssl: 'false' }), false);
});

test('an explicit verify_ssl: true is honored', () => {
  assert.equal(resolveOpenShiftOauthSettings(externalRun({ verify_ssl: true }), NO_RHBK).verifySsl, true);
});

test('disabling verification does not change validation of anything else', () => {
  assert.deepEqual(validateOidcInputs(externalRun({ verify_ssl: false }), NO_RHBK), []);
  assert.deepEqual(validateOidcInputs(externalRun({ verify_ssl: true }), NO_RHBK), []);
});
