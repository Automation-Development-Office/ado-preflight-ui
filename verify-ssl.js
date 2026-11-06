'use strict';

// Strict parsing of openshift.oauth_rhbk.verify_ssl (Keycloak TLS verification for
// OpenShift OIDC). Mirrors parseVerifySsl in src/rhbkClients.mjs, parse_verify_ssl in the
// collection's preflight_oidc.py and the first tasks of the ocp_oidc_auth role.
//
//   missing / null / blank          -> verify
//   true, yes, on, 1                -> verify
//   false, no, off, 0               -> verification off, explicitly
//   anything else (garbage, tru...) -> invalid; never read as false

const TRUE_TOKENS = ['1', 'true', 'yes', 'on'];
const FALSE_TOKENS = ['0', 'false', 'no', 'off'];

function parseVerifySsl(value) {
  if (value === undefined || value === null) return { verify: true, valid: true, explicit: false };
  if (typeof value === 'boolean') return { verify: value, valid: true, explicit: true };
  if (typeof value === 'number') {
    if (value === 1) return { verify: true, valid: true, explicit: true };
    if (value === 0) return { verify: false, valid: true, explicit: true };
    return { verify: true, valid: false, explicit: true };
  }
  if (typeof value === 'string') {
    const token = value.trim().toLowerCase();
    if (token === '') return { verify: true, valid: true, explicit: false };
    if (TRUE_TOKENS.includes(token)) return { verify: true, valid: true, explicit: true };
    if (FALSE_TOKENS.includes(token)) return { verify: false, valid: true, explicit: true };
  }
  return { verify: true, valid: false, explicit: true };
}

function verifySslErrorMessage(value) {
  let shown = JSON.stringify(value);
  if (shown === undefined) shown = String(value);
  if (shown.length > 40) shown = `${shown.slice(0, 37)}..."`;
  return `OpenShift OIDC: verify_ssl ${shown} is not a recognized value. Use true, yes, on or 1 to verify the Keycloak TLS certificate, false, no, off or 0 to turn verification off, or leave it blank to verify. An unrecognized value is never read as false.`;
}

function openShiftOidcRequested(data) {
  const components = Array.isArray(data?.components) ? data.components : [];
  const options = data?.component_options?.openshift;
  const selected = components.includes('all') || components.includes('openshift');
  return selected && Array.isArray(options) && options.includes('oauth_rhbk');
}

/**
 * Check (and canonicalize) openshift.oauth_rhbk.verify_ssl on a normalized payload.
 * A valid explicit value is written back as a boolean. Returns an error message for an
 * unrecognized value when OpenShift OIDC is requested, otherwise ''. The value is
 * never rewritten when it is invalid.
 */
function checkOpenShiftVerifySsl(data) {
  const oauth = data?.openshift?.oauth_rhbk;
  if (!oauth || typeof oauth !== 'object') return '';
  const parsed = parseVerifySsl(oauth.verify_ssl);
  if (!parsed.valid) {
    return openShiftOidcRequested(data) ? verifySslErrorMessage(oauth.verify_ssl) : '';
  }
  // Canonicalize only what the user set ("no" -> false); absent or blank stays as sent,
  // so generation writes nothing and an existing explicit value is left alone.
  if (parsed.explicit) oauth.verify_ssl = parsed.verify;
  return '';
}

module.exports = { parseVerifySsl, verifySslErrorMessage, checkOpenShiftVerifySsl };
