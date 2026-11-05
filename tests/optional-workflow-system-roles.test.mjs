import assert from 'node:assert/strict';
import test from 'node:test';
import { filterOpenShiftWorkflow, workflowPreviewKeys } from '../src/controllerWorkflowCatalog.mjs';
import {
  RHEL_SYSTEM_ROLES,
  RHEL_SYSTEM_ROLE_PROFILES,
  profileForSystemRoles,
  systemRolesForProfile,
  knownSystemRoleApp
} from '../src/rhelSystemRolesCatalog.mjs';

function ids(preflight) {
  return filterOpenShiftWorkflow(workflowPreviewKeys(preflight)).nodes.map((node) => node.id);
}

test('storage and pull secret stay out of the workflow until asked', () => {
  const base = {
    components: ['openshift'],
    component_apps: { openshift: [] },
    component_options: { openshift: ['storage_class', 'update_pull_secret'] },
    openshift: { storage_class_nfs: true, storage_class_iscsi: true }
  };
  const hidden = ids(base);
  assert.equal(hidden.includes('Install NFS CSI'), false);
  assert.equal(hidden.includes('Install Synology iSCSI CSI'), false);
  assert.equal(hidden.includes('Update Pull Secret'), false);

  const shown = ids({
    ...base,
    openshift: {
      storage_class_nfs: true,
      storage_class_iscsi: true,
      nfs_include_in_workflow: true,
      iscsi_include_in_workflow: true,
      pull_secret_include_in_workflow: true
    }
  });
  assert.equal(shown.includes('Install NFS CSI'), true);
  assert.equal(shown.includes('Install Synology iSCSI CSI'), true);
  assert.equal(shown.includes('Update Pull Secret'), true);
});

test('system role profiles only check catalog roles and stay editable', () => {
  assert.equal(RHEL_SYSTEM_ROLES.length, 34);
  const apps = new Set(RHEL_SYSTEM_ROLES.map((role) => role.app));
  for (const [name, selected] of Object.entries(RHEL_SYSTEM_ROLE_PROFILES)) {
    for (const app of selected) assert.equal(apps.has(app), true, `${name} ${app}`);
  }
  assert.deepEqual(systemRolesForProfile('minimal'), RHEL_SYSTEM_ROLE_PROFILES.minimal);
  assert.equal(systemRolesForProfile('custom'), null);
  assert.equal(profileForSystemRoles(RHEL_SYSTEM_ROLE_PROFILES.security), 'security');
  assert.equal(profileForSystemRoles(['system_role_firewall']), 'custom');
  assert.equal(knownSystemRoleApp('system_role_firewall'), true);
  assert.equal(knownSystemRoleApp('idm_server'), false);
  const saved = JSON.parse(JSON.stringify({
    profile: 'standard',
    generate_playbooks: true,
    generate_job_templates: false,
    include_in_workflow: true,
    roles: { firewall: {} }
  }));
  assert.equal(saved.include_in_workflow, true);
  assert.equal(saved.generate_job_templates, false);
  assert.deepEqual(saved.roles, { firewall: {} });
});
