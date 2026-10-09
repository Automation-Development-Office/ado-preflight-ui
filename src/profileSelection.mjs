// Profiles expand into the existing component contract; no new bootstrap keys.
export const satelliteProfileOptions = {
  Server: ['satellite_server_install'],
  'Client Satellite Registration': ['satellite_client_tools'],
  'Content view': ['satellite_content_view'],
  Capsule: ['satellite_capsule_install'],
  'Dynamic inventory': ['satellite_dynamic_inventory'],
  'OIDC / Keycloak': ['satellite_oidc'],
  'Full Satellite': [
    'satellite_server_install',
    'satellite_client_tools',
    'satellite_content_view',
    'satellite_capsule_install',
    'satellite_dynamic_inventory',
    'satellite_oidc'
  ]
};

export function selectProfileApps(source, group, apps, groups, catalogs, simpleComponents, profileName) {
  const copy = JSON.parse(JSON.stringify(source));
  const wasAll = (copy.components || []).includes('all');
  copy.component_apps ||= {};
  if (wasAll) {
    // Materialize the other targets so selecting one profile cannot silently
    // discard an imported legacy `all` selection.
    groups.forEach(target => { copy.component_apps[target] = [...catalogs[target]]; });
    copy.components = [...groups, 'jira'];
  }
  const previous = copy.component_apps[group] || [];
  copy.component_apps[group] = [...apps];
  copy.components = [...new Set([...(copy.components || []).filter(value => value !== 'all'), group])];
  previous.filter(app => simpleComponents.includes(app)).forEach(app => {
    if (app !== group && !Object.values(copy.component_apps).some(values => values.includes(app))) {
      copy.components = copy.components.filter(value => value !== app);
    }
  });
  copy.component = copy.components[0] || '';
  copy.selected_component_apps = [];
  copy.component_options ||= {};
  if (group !== 'satellite') {
    apps.filter(app => !previous.includes(app)).forEach(app => { copy.component_options[app] = []; });
  }
  if (group === 'aws') copy.component_options.aws = [...apps];
  if (group === 'satellite') {
    copy.component_apps.satellite = apps.length ? [...apps] : ['satellite'];
    if (profileName && profileName !== 'Custom' && satelliteProfileOptions[profileName]) {
      copy.component_options.satellite = [...satelliteProfileOptions[profileName]];
    }
  }
  return syncPlatformInstallOptions(copy);
}

const PLATFORM_INSTALL_APPS = ['grafana', 'rhbk', 'gitlab'];

export function componentIsSelected(source, key) {
  const components = source?.components || [];
  if (components.includes('all') || components.includes(key)) return true;
  return Object.values(source?.component_apps || {}).some(
    apps => Array.isArray(apps) && apps.includes(key)
  );
}

/** standalone when the app is only on RHEL, openshift when it is only on OpenShift. */
export function platformInstallMode(source, app) {
  const components = source?.components || [];
  const all = components.includes('all');
  const openshiftOn = all || components.includes('openshift');
  const rhelOn = all || components.includes('rhel');
  const inOpenShift = (source?.component_apps?.openshift || []).includes(app);
  const inRhel = (source?.component_apps?.rhel || []).includes(app);
  if (inRhel && !inOpenShift) return 'standalone';
  if (inOpenShift && !inRhel) return 'openshift';
  if (rhelOn && !openshiftOn) return 'standalone';
  if (openshiftOn && !rhelOn) return 'openshift';
  return 'both';
}

export function visiblePlatformOptions(component, mode, options) {
  if (mode === 'both') return options;
  const hide = new Set();
  if (component === 'grafana') {
    hide.add('install');
    hide.add('standalone');
    if (mode === 'standalone') hide.add('alternate_route');
  } else if (component === 'gitlab' || component === 'rhbk') {
    hide.add('standalone');
  }
  return options.filter(option => !hide.has(option));
}

/** Force the install that matches the selected platform and drop the other platform's options. */
export function syncPlatformInstallOptions(copy) {
  copy.component_options ||= {};
  PLATFORM_INSTALL_APPS.forEach(app => {
    if (!componentIsSelected(copy, app)) return;
    const mode = platformInstallMode(copy, app);
    let options = [...(copy.component_options[app] || [])];
    if (mode === 'standalone') {
      options = options.filter(option => option !== 'install' && option !== 'alternate_route');
      if (!options.includes('standalone')) options.push('standalone');
    } else if (mode === 'openshift') {
      options = options.filter(option => option !== 'standalone');
      if (app === 'grafana' && !options.includes('install')) options.push('install');
    }
    copy.component_options[app] = options;
  });
  return copy;
}

function foldHostnameIntoHostList(config) {
  if (!config || typeof config !== 'object') return config;
  const primary = String(config.hostname || '').trim();
  const raw = config.hosts;
  const hosts = Array.isArray(raw)
    ? raw.map(item => String(item || '').trim()).filter(Boolean)
    : String(raw || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean);
  if (primary && !hosts.includes(primary)) hosts.unshift(primary);
  config.hosts = hosts;
  config.hostname = '';
  return config;
}

function disablePublicGalaxyCredential(aap) {
  if (!aap || !Array.isArray(aap.galaxy_credentials)) return aap;
  aap.galaxy_credentials = aap.galaxy_credentials.map(credential => {
    if (!credential) return credential;
    if (credential.id === 'galaxy' || credential.name === 'Ansible Galaxy') {
      return { ...credential, enabled: false, attach_to_org: false };
    }
    return credential;
  });
  return aap;
}

function galaxySetupTokenError(aap) {
  if (!aap || aap.galaxy_setup_enabled !== true) return '';
  if (String(aap.galaxy_hub_token || '').trim()) return '';
  const enabled = (Array.isArray(aap.galaxy_credentials) ? aap.galaxy_credentials : [])
    .filter(credential => credential && credential.enabled !== false);
  const missing = enabled.filter(credential => !String(credential.token || '').trim());
  if (enabled.length > 0 && missing.length === 0) return '';
  return 'Galaxy setup needs an API token. Set General → Hub / Galaxy API token, or put a token on each enabled Galaxy credential. One of those is enough.';
}
