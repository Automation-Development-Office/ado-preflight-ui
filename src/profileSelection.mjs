// Profiles expand into the existing component contract; no new bootstrap keys.
export function selectProfileApps(source, group, apps, groups, catalogs, simpleComponents) {
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
  apps.filter(app => !previous.includes(app)).forEach(app => { copy.component_options[app] = []; });
  if (group === 'aws') copy.component_options.aws = [...apps];
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
