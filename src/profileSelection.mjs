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
  // Use the existing standalone option for RHEL-only app deployments.
  for (const app of ['grafana', 'rhbk', 'gitlab']) {
    if (!apps.includes(app)) continue;
    const options = copy.component_options[app] || [];
    if (group === 'rhel' && !(copy.component_apps.openshift || []).includes(app)) {
      copy.component_options[app] = [...new Set([...options, 'standalone'])];
    } else if (group === 'openshift' && !(copy.component_apps.rhel || []).includes(app)) {
      copy.component_options[app] = options.filter(option => option !== 'standalone');
    }
  }
  return copy;
}
