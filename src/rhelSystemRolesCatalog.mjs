/**
 * Selectable RHEL system roles. App ids match
 * roles/bootstrap_generate_playbook_repo/files/rhel_system_roles_catalog.yml
 * in infra.automation_development_office. Profiles only check those ids.
 */
export const RHEL_SYSTEM_ROLES = [
  {
    app: 'system_role_ad_integration',
    role: 'ad_integration',
    title: 'Ad integration',
    summary: 'Join the host to Active Directory.',
    settingsKey: 'rhel_system_roles.ad_integration',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-ad_integration-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | ad_integration'
  },
  {
    app: 'system_role_aide',
    role: 'aide',
    title: 'Aide',
    summary: 'Configure AIDE file-integrity checks.',
    settingsKey: 'rhel_system_roles.aide',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-aide-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | aide'
  },
  {
    app: 'system_role_auditd',
    role: 'auditd',
    title: 'Auditd',
    summary: 'Configure the Linux audit daemon.',
    settingsKey: 'rhel_system_roles.auditd',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-auditd-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | auditd'
  },
  {
    app: 'system_role_bootloader',
    role: 'bootloader',
    title: 'Bootloader',
    summary: 'Configure boot loader entries.',
    settingsKey: 'rhel_system_roles.bootloader',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-bootloader-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | bootloader'
  },
  {
    app: 'system_role_certificate',
    role: 'certificate',
    title: 'Certificate',
    summary: 'Issue or install TLS certificates.',
    settingsKey: 'rhel_system_roles.certificate',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-certificate-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | certificate'
  },
  {
    app: 'system_role_cockpit',
    role: 'cockpit',
    title: 'Cockpit',
    summary: 'Configure the Cockpit web console.',
    settingsKey: 'rhel_system_roles.cockpit',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-cockpit-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | cockpit'
  },
  {
    app: 'system_role_crypto_policies',
    role: 'crypto_policies',
    title: 'Crypto policies',
    summary: 'Set the system-wide cryptographic policy.',
    settingsKey: 'rhel_system_roles.crypto_policies',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-crypto_policies-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | crypto_policies'
  },
  {
    app: 'system_role_fapolicyd',
    role: 'fapolicyd',
    title: 'Fapolicyd',
    summary: 'Configure application allow-listing.',
    settingsKey: 'rhel_system_roles.fapolicyd',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-fapolicyd-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | fapolicyd'
  },
  {
    app: 'system_role_firewall',
    role: 'firewall',
    title: 'Firewall',
    summary: 'Configure firewalld zones, services, and ports.',
    settingsKey: 'rhel_system_roles.firewall',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-firewall-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | firewall'
  },
  {
    app: 'system_role_ha_cluster',
    role: 'ha_cluster',
    title: 'Ha cluster',
    summary: 'Configure a Pacemaker high-availability cluster.',
    settingsKey: 'rhel_system_roles.ha_cluster',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-ha_cluster-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | ha_cluster'
  },
  {
    app: 'system_role_journald',
    role: 'journald',
    title: 'Journald',
    summary: 'Configure systemd-journald.',
    settingsKey: 'rhel_system_roles.journald',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-journald-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | journald'
  },
  {
    app: 'system_role_kdump',
    role: 'kdump',
    title: 'Kdump',
    summary: 'Configure kernel crash dumps.',
    settingsKey: 'rhel_system_roles.kdump',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-kdump-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | kdump'
  },
  {
    app: 'system_role_kernel_settings',
    role: 'kernel_settings',
    title: 'Kernel settings',
    summary: 'Apply sysctl and kernel settings.',
    settingsKey: 'rhel_system_roles.kernel_settings',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-kernel_settings-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | kernel_settings'
  },
  {
    app: 'system_role_keylime_server',
    role: 'keylime_server',
    title: 'Keylime server',
    summary: 'Configure a Keylime attestation server.',
    settingsKey: 'rhel_system_roles.keylime_server',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-keylime_server-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | keylime_server'
  },
  {
    app: 'system_role_logging',
    role: 'logging',
    title: 'Logging',
    summary: 'Configure rsyslog logging.',
    settingsKey: 'rhel_system_roles.logging',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-logging-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | logging'
  },
  {
    app: 'system_role_metrics',
    role: 'metrics',
    title: 'Metrics',
    summary: 'Configure performance metric collection.',
    settingsKey: 'rhel_system_roles.metrics',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-metrics-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | metrics'
  },
  {
    app: 'system_role_mssql',
    role: 'mssql',
    title: 'Mssql',
    summary: 'Configure Microsoft SQL Server.',
    settingsKey: 'rhel_system_roles.mssql',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-mssql-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | mssql'
  },
  {
    app: 'system_role_nbde_client',
    role: 'nbde_client',
    title: 'Nbde client',
    summary: 'Configure an NBDE (Tang/Clevis) client.',
    settingsKey: 'rhel_system_roles.nbde_client',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-nbde_client-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | nbde_client'
  },
  {
    app: 'system_role_nbde_server',
    role: 'nbde_server',
    title: 'Nbde server',
    summary: 'Configure an NBDE Tang server.',
    settingsKey: 'rhel_system_roles.nbde_server',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-nbde_server-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | nbde_server'
  },
  {
    app: 'system_role_network',
    role: 'network',
    title: 'Network',
    summary: 'Configure network interfaces and connections.',
    settingsKey: 'rhel_system_roles.network',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-network-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | network'
  },
  {
    app: 'system_role_podman',
    role: 'podman',
    title: 'Podman',
    summary: 'Configure Podman containers and their systemd units.',
    settingsKey: 'rhel_system_roles.podman',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-podman-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | podman'
  },
  {
    app: 'system_role_postfix',
    role: 'postfix',
    title: 'Postfix',
    summary: 'Configure the Postfix mail transfer agent.',
    settingsKey: 'rhel_system_roles.postfix',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-postfix-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | postfix'
  },
  {
    app: 'system_role_postgresql',
    role: 'postgresql',
    title: 'Postgresql',
    summary: 'Configure PostgreSQL.',
    settingsKey: 'rhel_system_roles.postgresql',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-postgresql-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | postgresql'
  },
  {
    app: 'system_role_rhc',
    role: 'rhc',
    title: 'Rhc',
    summary: 'Register the host with Red Hat Subscription Management and Insights.',
    settingsKey: 'rhel_system_roles.rhc',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-rhc-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | rhc'
  },
  {
    app: 'system_role_selinux',
    role: 'selinux',
    title: 'Selinux',
    summary: 'Configure SELinux policy, booleans, and file contexts.',
    settingsKey: 'rhel_system_roles.selinux',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-selinux-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | selinux'
  },
  {
    app: 'system_role_snapshot',
    role: 'snapshot',
    title: 'Snapshot',
    summary: 'Manage storage snapshots.',
    settingsKey: 'rhel_system_roles.snapshot',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-snapshot-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | snapshot'
  },
  {
    app: 'system_role_ssh',
    role: 'ssh',
    title: 'Ssh',
    summary: 'Configure the SSH client.',
    settingsKey: 'rhel_system_roles.ssh',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-ssh-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | ssh'
  },
  {
    app: 'system_role_storage',
    role: 'storage',
    title: 'Storage',
    summary: 'Configure disks, filesystems, and mounts.',
    settingsKey: 'rhel_system_roles.storage',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-storage-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | storage'
  },
  {
    app: 'system_role_sudo',
    role: 'sudo',
    title: 'Sudo',
    summary: 'Configure sudo rules.',
    settingsKey: 'rhel_system_roles.sudo',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-sudo-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | sudo'
  },
  {
    app: 'system_role_systemd',
    role: 'systemd',
    title: 'Systemd',
    summary: 'Manage systemd units.',
    settingsKey: 'rhel_system_roles.systemd',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-systemd-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | systemd'
  },
  {
    app: 'system_role_timesync',
    role: 'timesync',
    title: 'Timesync',
    summary: 'Configure time synchronization.',
    settingsKey: 'rhel_system_roles.timesync',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-timesync-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | timesync'
  },
  {
    app: 'system_role_tlog',
    role: 'tlog',
    title: 'Tlog',
    summary: 'Configure terminal session recording.',
    settingsKey: 'rhel_system_roles.tlog',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-tlog-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | tlog'
  },
  {
    app: 'system_role_tuned',
    role: 'tuned',
    title: 'Tuned',
    summary: 'Apply a TuneD performance profile.',
    settingsKey: 'rhel_system_roles.tuned',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-tuned-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | tuned'
  },
  {
    app: 'system_role_vpn',
    role: 'vpn',
    title: 'Vpn',
    summary: 'Configure a VPN connection.',
    settingsKey: 'rhel_system_roles.vpn',
    playbook: 'playbooks/rhel_system_roles/ado-system-role-vpn-bootstrap.yml',
    jobTemplate: 'ADO | RHEL System Role | vpn'
  },
];

export const RHEL_SYSTEM_ROLE_PROFILES = {
  minimal: ['system_role_timesync', 'system_role_ssh'],
  standard: [
    'system_role_timesync',
    'system_role_ssh',
    'system_role_firewall',
    'system_role_selinux',
    'system_role_logging'
  ],
  security: [
    'system_role_firewall',
    'system_role_selinux',
    'system_role_crypto_policies',
    'system_role_ssh',
    'system_role_aide',
    'system_role_fapolicyd',
    'system_role_sudo'
  ],
  custom: []
};

const PROFILE_ORDER = ['minimal', 'standard', 'security'];

export function profileForSystemRoles(selected = []) {
  const got = [...selected].map(String).sort().join('|');
  for (const name of PROFILE_ORDER) {
    const expected = [...RHEL_SYSTEM_ROLE_PROFILES[name]].sort().join('|');
    if (got === expected) return name;
  }
  return 'custom';
}

export function systemRolesForProfile(profile) {
  if (profile === 'custom') return null;
  return [...(RHEL_SYSTEM_ROLE_PROFILES[profile] || [])];
}

export function knownSystemRoleApp(app) {
  return RHEL_SYSTEM_ROLES.some((role) => role.app === app);
}

