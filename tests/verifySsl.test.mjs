import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  openShiftVerifySsl,
  parseVerifySsl,
  resolveOpenShiftOauthSettings,
  validateOidcInputs,
  validateOpenShiftOauthSettings
} from '../src/rhbkClients.mjs';

const require = createRequire(import.meta.url);
const server = require('../verify-ssl.js');

// Strict verify_ssl parsing. The UI (rhbkClients.mjs), the server (verify-ssl.js), the
// Python validator and the ocp_oidc_auth role all follow this table. An unrecognized
// value is never read as false.

const VALID = [
  [true, true, true], ['true', true, true], ['TRUE', true, true], [' Yes ', true, true],
  ['on', true, true], ['ON', true, true], ['1', true, true], [1, true, true], [1.0, true, true],
  [false, false, true], ['false', false, true], ['FALSE', false, true], ['no', false, true],
  ['No', false, true], ['off', false, true], [' off ', false, true], ['0', false, true],
  [0, false, true],
  [undefined, true, false], [null, true, false], ['', true, false], ['   ', true, false]
];

const INVALID = [
  'garbage', 'tru', 'flase', 'ture', 'fals', 'yess', 'of', 'enabled', 'disabled', 'none',
  'null', '2', '-1', '01', '1.0', '0.0', 'true false',
  2, -1, 10, 0.5, 1.5, NaN, Infinity, [], [true], {}, { verify: true }
];

const label = value => (typeof value === 'number' && Number.isNaN(value) ? 'NaN' : JSON.stringify(value) ?? String(value));

for (const [value, verify, explicit] of VALID) {
  test(`UI and server accept verify_ssl ${label(value)}`, () => {
    const expected = { verify, valid: true, explicit };
    assert.deepEqual(parseVerifySsl(value), expected);
    assert.deepEqual(server.parseVerifySsl(value), expected);
    assert.equal(openShiftVerifySsl({ verify_ssl: value }), verify);
  });
}

for (const value of INVALID) {
  test(`UI and server reject verify_ssl ${label(value)} and never read it as false`, () => {
    const expected = { verify: true, valid: false, explicit: true };
    assert.deepEqual(parseVerifySsl(value), expected);
    assert.deepEqual(server.parseVerifySsl(value), expected);
    assert.equal(openShiftVerifySsl({ verify_ssl: value }), true);
  });
}

function externalRun(verify_ssl, options = ['oauth_rhbk']) {
  return {
    components: ['openshift'],
    component_apps: { openshift: [] },
    component_options: { openshift: options },
    openshift: {
      apps_domain: 'apps.example.test',
      oauth_rhbk: {
        idp_name: 'Corp-SSO',
        keycloak_hostname: 'sso.corp.example.test',
        realm: 'corp',
        client_id: 'corp-openshift',
        admin_user: 'kcadmin',
        admin_password: 'external-pass',
        verify_ssl
      }
    },
    component_config: {}
  };
}
const NO_RHBK = { isSelected: key => key === 'openshift' };

for (const value of INVALID) {
  test(`the form blocks a run with verify_ssl ${label(value)}`, () => {
    const state = externalRun(value);
    const errors = validateOidcInputs(state, NO_RHBK);
    assert.deepEqual(errors.map(e => e.kind), ['invalid-verify-ssl']);
    assert.match(errors[0].message, /not a recognized value/);
    assert.match(errors[0].message, /never read as false/);
    const settings = resolveOpenShiftOauthSettings(state, NO_RHBK);
    assert.equal(settings.verifySsl, true);
    assert.equal(settings.verifySslValid, false);
  });
}

test('valid values produce no verify_ssl validation error', () => {
  for (const [value] of VALID) {
    assert.deepEqual(validateOpenShiftOauthSettings(externalRun(value), NO_RHBK), [], label(value));
  }
});

test('an invalid value is ignored when OpenShift OIDC is not requested', () => {
  assert.deepEqual(validateOidcInputs(externalRun('garbage', []), NO_RHBK), []);
});

test('the error names the value and the accepted spellings', () => {
  const [error] = validateOidcInputs(externalRun('flase'), NO_RHBK);
  for (const needle of ['verify_ssl "flase"', 'true, yes, on or 1', 'false, no, off or 0', 'blank']) {
    assert.ok(error.message.includes(needle), error.message);
  }
});

// Server side ---------------------------------------------------------------------

test('server check rejects every invalid value for a requested OpenShift OIDC run', () => {
  for (const value of INVALID) {
    const data = externalRun(value);
    const message = server.checkOpenShiftVerifySsl(data);
    assert.match(message, /not a recognized value/, label(value));
    assert.equal(data.openshift.oauth_rhbk.verify_ssl === value || Number.isNaN(value), true, 'invalid value is left untouched');
  }
});

test('server check canonicalizes valid explicit values and leaves blank ones alone', () => {
  const canonical = [['no', false], ['OFF', false], ['0', false], [0, false], ['yes', true], ['on', true], ['1', true], [1, true]];
  for (const [input, output] of canonical) {
    const data = externalRun(input);
    assert.equal(server.checkOpenShiftVerifySsl(data), '');
    assert.equal(data.openshift.oauth_rhbk.verify_ssl, output, label(input));
  }
  for (const blank of [undefined, null, '', '  ']) {
    const data = externalRun(blank);
    assert.equal(server.checkOpenShiftVerifySsl(data), '');
    assert.equal(data.openshift.oauth_rhbk.verify_ssl, blank);
  }
});

test('server check does not block an invalid value when OpenShift OIDC is not requested', () => {
  assert.equal(server.checkOpenShiftVerifySsl(externalRun('garbage', [])), '');
  const other = externalRun('garbage');
  other.components = ['grafana'];
  assert.equal(server.checkOpenShiftVerifySsl(other), '');
});

test('server and UI produce the same message', () => {
  for (const value of ['garbage', 'tru', 2, []]) {
    assert.equal(server.verifySslErrorMessage(value), validateOidcInputs(externalRun(value), NO_RHBK)[0].message);
  }
});
