// Pure Keycloak (RHBK) client list transitions used by App.jsx.
// Extracted from App.jsx unchanged so the remove / auto-add behavior can be tested.
import { OIDC_DEFAULT_CLIENT_IDS } from './oidcClientDefaults.generated.mjs';

const CREATE_CLIENT_FALSE = new Set(['0', 'false', 'no', 'n', 'off']);

/** Apps with no Keycloak-consuming OIDC role. Auto-add must not create a client. */
export const RHBK_OIDC_PRESETS_WITHOUT_PROVISION = new Set(['gitlab']);

export function rhbkOidcPresetShouldAutoAdd(preset, copy) {
  const source = String(preset?.client?.source || preset?.key || '').trim().toLowerCase();
  if (RHBK_OIDC_PRESETS_WITHOUT_PROVISION.has(source)) return false;
  if (source === 'grafana' && copy && grafanaOidcIsExplicitlyDisabled(copy)) return false;
  return true;
}

/**
 * True when ADO should create/update this Keycloak client.
 * Missing / null / blank `create_client` means yes so existing JSON exports keep
 * the automated install path. Explicit false means use an existing client: keep
 * the row and app OIDC config, but do not put the id in generated rhbk_clients.
 * Mirrors rhbk_client_is_managed() in the ADO overlay.
 */
export function rhbkClientIsManaged(row) {
  const raw = row?.create_client;
  if (raw === undefined || raw === null) return true;
  if (raw === false || raw === 0) return false;
  if (raw === true || raw === 1) return true;
  const token = String(raw).trim().toLowerCase();
  if (!token) return true;
  return !CREATE_CLIENT_FALSE.has(token);
}

/** Upsert a Keycloak client row; replace a blank row when present. */
export function upsertRhbkClientRow(clients, next) {
  const list = Array.isArray(clients) ? clients.map(c => ({ ...c })) : [];
  const id = String(next.id || '').trim();
  const existingIdx = list.findIndex(c => String(c.id || '').trim() === id && id);
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...next };
    return list;
  }
  const emptyIdx = list.findIndex(
    c => !String(c.id || '').trim()
      && !String(c.name || '').trim()
      && !String(c.redirect_uris || '').trim()
      && !String(c.web_origins || '').trim()
  );
  if (emptyIdx >= 0) {
    list[emptyIdx] = { id: '', name: '', redirect_uris: '', web_origins: '', ...next };
    return list;
  }
  list.push({ id: '', name: '', redirect_uris: '', web_origins: '', ...next });
  return list;
}

/** Apply a preset client into rhbk.clients and mirror matching app OIDC client IDs. */
export function applyRhbkOidcClientPreset(copy, presetClient) {
  if (!copy.component_config) copy.component_config = {};
  if (!copy.component_config.rhbk) copy.component_config.rhbk = {};
  const rhbk = copy.component_config.rhbk;
  // Adding a client on purpose (preset menu / Add all) overrides an earlier removal.
  setDismissedIds(
    rhbk,
    dismissedIds(rhbk).filter(id => id !== String(presetClient.id || '').trim())
  );
  // Do not send create_client: an existing row that the operator set to No
  // (use an existing client) must not be flipped back to Yes by Add / auto-add.
  rhbk.clients = upsertRhbkClientRow(rhbk.clients, {
    id: presetClient.id,
    name: presetClient.name,
    redirect_uris: presetClient.redirect_uris,
    web_origins: presetClient.web_origins
  });

  if (presetClient.source === 'openshift') {
    rhbk.client = presetClient.id;
    rhbk.client_name = presetClient.name;
    rhbk.client_redirect_uris = presetClient.redirect_uris;
    rhbk.client_web_origins = presetClient.web_origins;
    rhbk.openshift_oidc_client_id = presetClient.id;
  }

  if (presetClient.source === 'grafana') {
    if (!copy.component_config.grafana) copy.component_config.grafana = {};
    if (!copy.component_config.grafana.oidc) copy.component_config.grafana.oidc = {};
    copy.component_config.grafana.oidc.client_id = presetClient.id;
    if (copy.component_config.grafana.oidc.enabled === undefined) {
      copy.component_config.grafana.oidc.enabled = true;
    }
  }

  if (presetClient.source === 'bookstack') {
    if (!copy.component_config.bookstack) copy.component_config.bookstack = {};
    copy.component_config.bookstack.oidc_client_id = presetClient.id;
    if (copy.component_config.bookstack.oidc_enabled === undefined) {
      copy.component_config.bookstack.oidc_enabled = true;
    }
  }

  if (presetClient.source === 'netbox') {
    if (!copy.component_config.netbox) copy.component_config.netbox = {};
    copy.component_config.netbox.oidc_client_id = presetClient.id;
    if (copy.component_config.netbox.oidc_enabled === undefined) {
      copy.component_config.netbox.oidc_enabled = true;
    }
  }

  if (presetClient.source === 'gitlab') {
    if (!copy.component_config.gitlab) copy.component_config.gitlab = {};
    copy.component_config.gitlab.oidc_client_id = presetClient.id;
    if (copy.component_config.gitlab.oidc_enabled === undefined) {
      copy.component_config.gitlab.oidc_enabled = true;
    }
  }

  if (presetClient.source === 'quay') {
    if (!copy.component_config.quay) copy.component_config.quay = {};
    copy.component_config.quay.oidc_client_id = presetClient.id;
    if (copy.component_config.quay.oidc_enabled === undefined) {
      copy.component_config.quay.oidc_enabled = true;
    }
  }

  if (presetClient.source === 'minio') {
    if (!copy.component_config.minio) copy.component_config.minio = {};
    copy.component_config.minio.oidc_client_id = presetClient.id;
    if (copy.component_config.minio.oidc_enabled === undefined) {
      copy.component_config.minio.oidc_enabled = true;
    }
  }

  if (presetClient.source === 'dev_hub') {
    if (!copy.component_config.dev_hub) copy.component_config.dev_hub = {};
    copy.component_config.dev_hub.keycloak_client_id = presetClient.id;
    delete copy.component_config.dev_hub.oidc_client_id;
  }

  return copy;
}

// Fields other components mirror a Keycloak client id into (see applyRhbkOidcClientPreset).
const APP_CLIENT_ID_MIRRORS = [
  ['openshift', 'oauth_rhbk', 'client_id'],
  ['component_config', 'rhbk', 'openshift_oidc_client_id'],
  ['component_config', 'grafana', 'oidc', 'client_id'],
  ['component_config', 'bookstack', 'oidc_client_id'],
  ['component_config', 'netbox', 'oidc_client_id'],
  ['component_config', 'gitlab', 'oidc_client_id'],
  ['component_config', 'quay', 'oidc_client_id'],
  ['component_config', 'minio', 'oidc_client_id'],
  ['component_config', 'dev_hub', 'keycloak_client_id'],
  ['component_config', 'dev_hub', 'oidc_client_id']
];

const clientIdOf = row => String(row?.id || '').trim();

/** Client ids the user explicitly removed; the auto-add pass must not bring them back. */
function dismissedIds(rhbk) {
  return Array.isArray(rhbk?.clients_dismissed) ? rhbk.clients_dismissed : [];
}

/** Keep the exported JSON tidy: no empty `clients_dismissed`. */
function setDismissedIds(rhbk, ids) {
  if (ids.length) rhbk.clients_dismissed = ids;
  else delete rhbk.clients_dismissed;
}

function clearMirrorsPointingAt(copy, id) {
  APP_CLIENT_ID_MIRRORS.forEach(path => {
    const parent = path.slice(0, -1).reduce((node, key) => node?.[key], copy);
    const leaf = path[path.length - 1];
    if (parent && typeof parent === 'object' && String(parent[leaf] || '').trim() === id) {
      parent[leaf] = '';
    }
  });
}

/**
 * Remove the client row at `index` (the X button). `rhbk.clients` stays the only
 * authority: the removal is remembered in `clients_dismissed`, mirrors that pointed
 * at the removed client are cleared, and the legacy single-client fields follow
 * the new first row. Clients other components use are never touched.
 */
export function removeRhbkClientAt(copy, index) {
  const rhbk = copy.component_config?.rhbk;
  if (!rhbk?.clients) return copy;
  const removedId = clientIdOf(rhbk.clients[index]);
  const list = rhbk.clients.filter((_, i) => i !== index);
  rhbk.clients = list.length
    ? list
    : [{ id: '', name: '', redirect_uris: '', web_origins: '' }];
  const first = rhbk.clients[0] || {};
  rhbk.client = clientIdOf(first);
  rhbk.client_name = first.name || '';
  rhbk.client_redirect_uris = first.redirect_uris || '';
  rhbk.client_web_origins = first.web_origins || '';
  if (removedId && !rhbk.clients.some(row => clientIdOf(row) === removedId)) {
    if (!dismissedIds(rhbk).includes(removedId)) {
      setDismissedIds(rhbk, [...dismissedIds(rhbk), removedId]);
    }
    clearMirrorsPointingAt(copy, removedId);
  }
  return copy;
}

/**
 * Edit one field of a client row. Changing the id of a generated (preset) client
 * counts as removing it: the old id is dismissed so the auto-add pass does not put
 * a second copy back. Typing keystrokes that only pass through non-preset ids add
 * nothing, and a dismissal is dropped as soon as that id is in the list again.
 */
export function updateRhbkClientField(copy, index, key, value, presetIds = []) {
  if (!copy.component_config) copy.component_config = {};
  if (!copy.component_config.rhbk) copy.component_config.rhbk = {};
  const rhbk = copy.component_config.rhbk;
  if (!rhbk.clients) rhbk.clients = [];
  const before = rhbk.clients[index] || {};
  const oldId = clientIdOf(before);
  rhbk.clients[index] = { ...before, [key]: value };
  if (index === 0 && key === 'id') rhbk.client = value;
  if (key === 'id') {
    const present = id => rhbk.clients.some(row => clientIdOf(row) === id);
    let dismissed = dismissedIds(rhbk);
    if (oldId && oldId !== String(value || '').trim() && presetIds.includes(oldId) && !present(oldId)) {
      dismissed = [...new Set([...dismissed, oldId])];
    }
    setDismissedIds(rhbk, dismissed.filter(id => !present(id)));
  }
  return copy;
}

/**
 * Add a preset client for every selected app whose client id is not in the list
 * yet and was not explicitly removed. Runs from an effect, so it must be a no-op
 * when nothing new is selected. With `prune`, a dismissal is forgotten once its
 * app is no longer offered (component deselected), so selecting that component
 * again restores its default client. Returns { copy, changed }.
 */
export function autoAddRhbkClientPresets(copy, presets, { prune = false } = {}) {
  const existing = new Set(
    (copy.component_config?.rhbk?.clients || []).map(clientIdOf).filter(Boolean)
  );
  let changed = false;
  const rhbk = copy.component_config?.rhbk;
  if (prune && rhbk && dismissedIds(rhbk).length) {
    const offered = new Set(presets.map(preset => clientIdOf(preset.client)));
    const kept = dismissedIds(rhbk).filter(id => offered.has(id));
    if (kept.length !== dismissedIds(rhbk).length) {
      setDismissedIds(rhbk, kept);
      changed = true;
    }
  }
  const dismissed = new Set(dismissedIds(copy.component_config?.rhbk));
  let next = copy;
  presets.forEach(preset => {
    const id = clientIdOf(preset.client);
    if (!id || existing.has(id) || dismissed.has(id)) return;
    if (!rhbkOidcPresetShouldAutoAdd(preset, next)) return;
    next = applyRhbkOidcClientPreset(next, preset.client);
    existing.add(id);
    changed = true;
  });
  const synced = syncOpenShiftClientRedirectUris(next);
  if (synced.changed) {
    next = synced.copy;
    changed = true;
  }
  return { copy: next, changed };
}

// ---------------------------------------------------------------------------
// Validation: an active OIDC integration must point at a client that exists.
// ---------------------------------------------------------------------------

const cfgOf = (state, key) => state?.component_config?.[key] || {};
const optionsOf = (state, key) => (
  Array.isArray(state?.component_options?.[key]) ? state.component_options[key] : []
);
const text = value => String(value ?? '').trim();

/**
 * Canonical MinIO client ID: ``oidc_client_id``, then nested ``oidc.client_id``.
 * Mirrors resolve_minio_oidc_client_id() in the ADO overlay.
 */
export function resolveMinioOidcClientId(state) {
  const cfg = cfgOf(state, 'minio');
  const nested = (cfg.oidc && typeof cfg.oidc === 'object') ? cfg.oidc : {};
  return text(cfg.oidc_client_id) || text(nested.client_id);
}

/**
 * Canonical Developer Hub client ID: ``keycloak_client_id``.
 * ``oidc_client_id`` is a pre-Phase-2 preset leftover. Used when the canonical
 * field is blank, or when the form still has the framework default and the
 * leftover is a different custom value (old exports).
 * Mirrors resolve_dev_hub_keycloak_client_id() in the ADO overlay.
 */
export function resolveDevHubKeycloakClientId(state) {
  const cfg = cfgOf(state, 'dev_hub');
  const canonical = text(cfg.keycloak_client_id);
  const legacy = text(cfg.oidc_client_id);
  const defaultId = text(OIDC_DEFAULT_CLIENT_IDS.dev_hub) || 'rhdh';
  if (canonical && legacy && canonical !== legacy) {
    if (canonical === defaultId && legacy !== defaultId) return legacy;
    return canonical;
  }
  return canonical || legacy;
}

/** Collapse Developer Hub client ID onto ``keycloak_client_id`` and drop leftover ``oidc_client_id``. */
export function normalizeDevHubClientFields(copy) {
  if (!copy || typeof copy !== 'object') return copy;
  if (!copy.component_config) return copy;
  const hub = copy.component_config.dev_hub;
  if (!hub || typeof hub !== 'object') return copy;
  const chosen = resolveDevHubKeycloakClientId(copy);
  if (chosen) hub.keycloak_client_id = chosen;
  delete hub.oidc_client_id;
  return copy;
}

/**
 * OpenShift OIDC client id: the explicit OpenShift field, then the explicit
 * `openshift_oidc_client_id`, then an OpenShift-specific row. Never the first row
 * and never the legacy `rhbk.client` (that can be another app's client).
 * Mirrors resolve_openshift_oidc_client_id() in the ADO overlay.
 */
export function resolveOpenShiftOidcClientId(state) {
  const oauth = state?.openshift?.oauth_rhbk || {};
  const rhbk = cfgOf(state, 'rhbk');
  const explicit = [oauth.client_id, oauth.keycloak_client_id, rhbk.openshift_oidc_client_id]
    .map(text)
    .find(Boolean);
  if (explicit) return explicit;
  const row = (rhbk.clients || []).find(client => {
    const id = clientIdOf(client);
    return id && (text(client?.source).toLowerCase() === 'openshift'
      || id.toLowerCase().startsWith('openshift'));
  });
  return row ? clientIdOf(row) : '';
}

export const OPENSHIFT_OIDC_DEFAULT_IDP_NAME = 'Keycloak';
const OPENSHIFT_OAUTH_CALLBACK_RE =
  /^https:\/\/oauth-openshift\.[^/]+\/oauth2callback\/[^/]+(?:\/[*]?)?$/i;

export function resolveOpenShiftOidcIdpName(state) {
  return text(state?.openshift?.oauth_rhbk?.idp_name) || OPENSHIFT_OIDC_DEFAULT_IDP_NAME;
}

export function openshiftOauthRedirectUri(appsDomain, idpName) {
  const apps = text(appsDomain);
  const idp = text(idpName) || OPENSHIFT_OIDC_DEFAULT_IDP_NAME;
  if (!apps || !idp) return '';
  return `https://oauth-openshift.${apps}/oauth2callback/${idp}`;
}

export function isOpenShiftOauthCallbackUri(value) {
  return OPENSHIFT_OAUTH_CALLBACK_RE.test(text(value));
}

export function grafanaOidcIsExplicitlyDisabled(state) {
  const raw = cfgOf(state, 'grafana')?.oidc?.enabled;
  if (raw === undefined || raw === null) return false;
  if (raw === false || raw === 0) return true;
  if (raw === true || raw === 1) return false;
  return CREATE_CLIENT_FALSE.has(String(raw).trim().toLowerCase());
}

export function rewriteOpenShiftOauthRedirectUris(uris, appsDomain, idpName) {
  const derived = openshiftOauthRedirectUri(appsDomain, idpName);
  const parts = String(uris || '')
    .split(/[\n,]+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (!derived) return parts.join('\n');
  if (!parts.length) return derived;
  const custom = parts.filter(part => !isOpenShiftOauthCallbackUri(part));
  if (custom.length === parts.length) return parts.join('\n');
  return [...custom, derived].join('\n');
}

export function rowIsOpenShiftOidcClient(row, state) {
  if (text(row?.source).toLowerCase() === 'openshift') return true;
  const id = clientIdOf(row);
  if (id.toLowerCase().startsWith('openshift')) return true;
  const resolved = resolveOpenShiftOidcClientId(state);
  return Boolean(id) && id === resolved;
}

export function syncOpenShiftClientRedirectUris(copy) {
  const rhbk = copy?.component_config?.rhbk;
  if (!rhbk || !Array.isArray(rhbk.clients)) return { copy, changed: false };
  const apps = text(copy?.openshift?.apps_domain);
  const idp = resolveOpenShiftOidcIdpName(copy);
  let changed = false;
  const clients = rhbk.clients.map(row => {
    if (!rowIsOpenShiftOidcClient(row, copy)) return row;
    const nextUris = rewriteOpenShiftOauthRedirectUris(row.redirect_uris, apps, idp);
    if (text(row.redirect_uris) === text(nextUris)) return row;
    changed = true;
    return { ...row, redirect_uris: nextUris };
  });
  if (!changed) return { copy, changed: false };
  return {
    copy: {
      ...copy,
      component_config: {
        ...copy.component_config,
        rhbk: { ...rhbk, clients }
      }
    },
    changed: true
  };
}

// Components whose OIDC client the form generates. `independent` uses only flags
// that already exist: the client is managed outside this Keycloak client list.
const OIDC_CONSUMERS = [
  {
    key: 'grafana',
    label: 'Grafana',
    clientId: s => cfgOf(s, 'grafana').oidc?.client_id,
    enabled: s => cfgOf(s, 'grafana').oidc?.enabled,
    skip: s => optionsOf(s, 'grafana').includes('standalone'),
    independent: s => cfgOf(s, 'grafana').oidc?.client_secret_manual === true,
    fix: 'Grafana > OIDC client ID'
  },
  {
    key: 'bookstack',
    label: 'BookStack',
    clientId: s => cfgOf(s, 'bookstack').oidc_client_id,
    enabled: s => cfgOf(s, 'bookstack').oidc_enabled,
    fix: 'BookStack > OIDC client ID'
  },
  {
    key: 'netbox',
    label: 'NetBox',
    clientId: s => cfgOf(s, 'netbox').oidc_client_id,
    enabled: s => cfgOf(s, 'netbox').oidc_enabled,
    fix: 'NetBox > OIDC client ID'
  },
  {
    key: 'gitlab',
    label: 'GitLab',
    clientId: s => cfgOf(s, 'gitlab').oidc_client_id,
    enabled: s => cfgOf(s, 'gitlab').oidc_enabled,
    fix: 'GitLab > OIDC client ID'
  },
  {
    key: 'quay',
    label: 'Quay',
    clientId: s => cfgOf(s, 'quay').oidc_client_id,
    enabled: s => cfgOf(s, 'quay').oidc_enabled,
    independent: s => cfgOf(s, 'quay').fetch_oidc_secret_from_rhbk === false,
    fix: 'Quay > OIDC client ID'
  },
  {
    key: 'minio',
    label: 'MinIO',
    clientId: s => resolveMinioOidcClientId(s),
    enabled: s => cfgOf(s, 'minio').oidc_enabled,
    independent: s => cfgOf(s, 'minio').fetch_oidc_secret_from_rhbk === false,
    fix: 'MinIO > OIDC client ID'
  },
  {
    key: 'dev_hub',
    label: 'Developer Hub',
    clientId: s => resolveDevHubKeycloakClientId(s),
    enabled: () => undefined,
    fix: 'Developer Hub > Keycloak client ID'
  }
];

/**
 * Find active OIDC integrations whose Keycloak client is missing.
 * `isSelected(key)` says whether a component is part of this bootstrap.
 *
 * Local mode (RHBK is part of this run): a reference to a client the operator
 * removed (including a blank ID whose default client was removed), or an enabled
 * integration with no client and no framework default, is an error.
 * External mode (no RHBK in this run, or the component's own "client managed
 * elsewhere" flag): the client list is not consulted; only a client id is required.
 * OpenShift OIDC needs its own client in either mode; the first Keycloak client
 * is never substituted.
 *
 * Returns [{ component, label, clientId, kind, message }]. The form stays
 * editable and exportable; callers block generation/deployment.
 */
export function validateRhbkClientReferences(state, { isSelected }) {
  const errors = [];
  const rhbk = cfgOf(state, 'rhbk');
  const localMode = Boolean(isSelected('rhbk'));
  const present = new Set((rhbk.clients || []).map(clientIdOf).filter(Boolean));
  const dismissed = new Set(dismissedIds(rhbk));

  // A blank client ID means the component's default client from
  // components_defaults.yml (generated into OIDC_DEFAULT_CLIENT_IDS). OpenShift and
  // GitLab have no default, so they always need an explicit client ID.
  const check = ({ component, label, clientId, independent, fix }) => {
    const id = text(clientId) || OIDC_DEFAULT_CLIENT_IDS[component] || '';
    const external = !localMode || independent;
    if (!id) {
      errors.push({
        component, label, clientId: '', kind: 'no-client',
        message: external
          ? `${label} OIDC uses an externally managed Keycloak client but no client ID is set. Set ${fix}, or disable ${label} OIDC.`
          : `${label} OIDC is enabled but has no Keycloak client. Add a client to the Keycloak client list and set ${fix} to it, or disable ${label} OIDC.`
      });
      return;
    }
    if (!external && dismissed.has(id) && !present.has(id)) {
      errors.push({
        component, label, clientId: id, kind: 'removed-client',
        message: `${label} OIDC still uses Keycloak client "${id}", which was removed from the client list. Add a replacement client and set ${fix} to it, add "${id}" back from Add Client, or disable ${label} OIDC.`
      });
    }
  };

  OIDC_CONSUMERS.forEach(consumer => {
    if (!isSelected(consumer.key) || consumer.skip?.(state)) return;
    const enabled = consumer.enabled(state);
    const requested = optionsOf(state, consumer.key).includes('oidc');
    if (enabled === false || !(enabled === true || requested)) return;
    check({
      component: consumer.key,
      label: consumer.label,
      clientId: consumer.clientId(state),
      independent: Boolean(consumer.independent?.(state)),
      fix: consumer.fix
    });
  });

  if (isSelected('openshift') && optionsOf(state, 'openshift').includes('oauth_rhbk')) {
    const oauth = state?.openshift?.oauth_rhbk || {};
    check({
      component: 'openshift',
      label: 'OpenShift',
      clientId: resolveOpenShiftOidcClientId(state),
      independent: oauth.fetch_client_secret === false,
      fix: 'OpenShift > OAuth / RHBK > OpenShift OIDC client ID'
    });
  }
  return errors;
}

// ---------------------------------------------------------------------------
// OpenShift OIDC connection settings (Keycloak host, realm, admin credentials).
// Mirrors preflight_oidc.py in the ADO collection.
//
// Two modes:
//  - RHBK is part of this run: host, realm and admin credentials are inherited
//    from the RHBK section unless the OpenShift section sets its own.
//  - Existing / external Keycloak (no RHBK in this run): host, realm, client id,
//    admin user and admin password all come from the OpenShift section.
// Neither mode creates or changes a Keycloak client: the job only reads the
// client secret, so the client must already exist in the realm.
// ---------------------------------------------------------------------------

export const OPENSHIFT_OIDC_MAPPING_METHODS = ['claim', 'lookup', 'add'];
const HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?(:\d{1,5})?$/;

/** Route host only: no scheme, no path. */
export const normalizeKeycloakHost = value => text(value)
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '')
  .trim();

const VERIFY_SSL_TRUE = ['1', 'true', 'yes', 'on'];
const VERIFY_SSL_FALSE = ['0', 'false', 'no', 'off'];

/**
 * Strict parse of openshift.oauth_rhbk.verify_ssl -> { verify, valid, explicit }.
 * Missing, null and blank mean "verify". true / yes / on / 1 verify; false / no / off / 0
 * turn verification off. Anything else is invalid and is never read as false: `verify`
 * stays true. Mirrors parse_verify_ssl in preflight_oidc.py, verify-ssl.js (server) and the
 * first tasks of the ocp_oidc_auth role.
 */
export function parseVerifySsl(value) {
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
    if (VERIFY_SSL_TRUE.includes(token)) return { verify: true, valid: true, explicit: true };
    if (VERIFY_SSL_FALSE.includes(token)) return { verify: false, valid: true, explicit: true };
  }
  return { verify: true, valid: false, explicit: true };
}

/** Value for the form checkbox. An invalid value shows as "verify" and is reported by validation. */
export function openShiftVerifySsl(oauth) {
  return parseVerifySsl(oauth?.verify_ssl).verify;
}

export function verifySslErrorMessage(value) {
  let shown = JSON.stringify(value);
  if (shown === undefined) shown = String(value);
  if (shown.length > 40) shown = `${shown.slice(0, 37)}..."`;
  return `OpenShift OIDC: verify_ssl ${shown} is not a recognized value. Use true, yes, on or 1 to verify the Keycloak TLS certificate, false, no, off or 0 to turn verification off, or leave it blank to verify. An unrecognized value is never read as false.`;
}

/** Effective OpenShift OIDC settings for the current form state. */
export function resolveOpenShiftOauthSettings(state, { isSelected }) {
  const oauth = state?.openshift?.oauth_rhbk || {};
  const rhbk = cfgOf(state, 'rhbk');
  const rhbkMode = Boolean(isSelected('rhbk'));
  const appsDomain = text(state?.openshift?.apps_domain);

  const inherited = rhbkMode
    ? {
      host: normalizeKeycloakHost(
        text(rhbk.hostname) || (appsDomain ? `keycloak.${appsDomain}` : '')
      ),
      realm: text(rhbk.realm),
      user: text(rhbk.admin_user) || 'admin'
    }
    : { host: '', realm: '', user: '' };

  const ownHost = normalizeKeycloakHost(oauth.keycloak_hostname);
  const ownPassword = text(oauth.admin_password);
  let passwordSource = '';
  if (ownPassword) passwordSource = 'openshift';
  else if (rhbkMode && text(rhbk.admin_password)) passwordSource = 'rhbk';

  return {
    mode: rhbkMode ? 'rhbk' : 'external',
    hostname: ownHost || inherited.host,
    inheritedHostname: inherited.host,
    hostnameExplicit: Boolean(ownHost),
    realm: text(oauth.realm) || inherited.realm,
    realmExplicit: Boolean(text(oauth.realm)),
    clientId: resolveOpenShiftOidcClientId(state),
    idpName: text(oauth.idp_name) || OPENSHIFT_OIDC_DEFAULT_IDP_NAME,
    mappingMethod: text(oauth.mapping_method) || 'claim',
    verifySsl: parseVerifySsl(oauth.verify_ssl).verify,
    verifySslValid: parseVerifySsl(oauth.verify_ssl).valid,
    verifySslExplicit: parseVerifySsl(oauth.verify_ssl).explicit,
    adminUser: text(oauth.admin_user) || inherited.user,
    adminUserExplicit: Boolean(text(oauth.admin_user)),
    adminPasswordSource: passwordSource
  };
}

/**
 * Missing or conflicting OpenShift OIDC connection inputs. The client id is
 * reported by validateRhbkClientReferences.
 */
export function validateOpenShiftOauthSettings(state, { isSelected }) {
  if (!(isSelected('openshift') && optionsOf(state, 'openshift').includes('oauth_rhbk'))) {
    return [];
  }
  const s = resolveOpenShiftOauthSettings(state, { isSelected });
  const external = s.mode === 'external';
  const where = external ? 'Existing Keycloak (RHBK is not part of this run)' : 'OpenShift OIDC';
  const errors = [];
  const add = (kind, message) => errors.push({
    component: 'openshift', label: 'OpenShift', clientId: '', kind, message
  });

  if (!s.verifySslValid) {
    add('invalid-verify-ssl', verifySslErrorMessage(state?.openshift?.oauth_rhbk?.verify_ssl));
  }
  if (!s.hostname) {
    add('missing-hostname', external
      ? `${where}: set the Keycloak hostname.`
      : 'OpenShift OIDC: no Keycloak hostname. Set the RHBK hostname or the Keycloak hostname on this tab.');
  } else if (!HOST_PATTERN.test(s.hostname)) {
    add('invalid-hostname',
      `OpenShift OIDC: Keycloak hostname "${s.hostname}" is not a valid host name. Use the route host only (for example keycloak.example.com).`);
  }
  if (!s.realm) {
    add('missing-realm', external
      ? `${where}: set the Keycloak realm.`
      : 'OpenShift OIDC: no Keycloak realm. Set the RHBK realm or the realm on this tab.');
  }
  if (!OPENSHIFT_OIDC_MAPPING_METHODS.includes(s.mappingMethod)) {
    add('invalid-mapping-method',
      `OpenShift OIDC: mapping method "${s.mappingMethod}" is not one of ${OPENSHIFT_OIDC_MAPPING_METHODS.join(', ')}.`);
  }
  if (!s.adminUser) {
    add('missing-admin-user',
      `${where}: set the Keycloak admin user. The job uses it only to read the client secret.`);
  }
  if (!s.adminPasswordSource) {
    add('missing-admin-password', external
      ? `${where}: set the Keycloak admin password. The job uses it only to read the client secret; the client is never created or changed.`
      : 'OpenShift OIDC: no Keycloak admin password. Set the RHBK admin password or the admin password on this tab.');
  }
  if (
    !external
    && s.hostnameExplicit
    && s.inheritedHostname
    && s.hostname.toLowerCase() !== s.inheritedHostname.toLowerCase()
    && (!text(state?.openshift?.oauth_rhbk?.admin_password) || !s.adminUserExplicit)
  ) {
    add('credential-host-mismatch',
      `OpenShift OIDC points at "${s.hostname}", not the RHBK in this run ("${s.inheritedHostname}"). The RHBK admin credentials do not apply there: set the admin user and admin password on this tab, or clear the hostname to use RHBK.`);
  }
  return errors;
}

/** Client references plus OpenShift connection settings: everything that blocks a run. */
export function validateOidcInputs(state, { isSelected }) {
  return [
    ...validateRhbkClientReferences(state, { isSelected }),
    ...validateOpenShiftOauthSettings(state, { isSelected })
  ];
}

/** Text shown when a run is blocked; the form and its export stay usable. */
export function formatRhbkClientErrors(errors) {
  return errors.map(error => `- ${error.message}`).join('\n');
}
