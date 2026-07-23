# ADO Preflight UI Changelog

## Unreleased

- AAP connectivity no longer launches Demo Job Template by default; when smoke test is enabled it skips cleanly if that template does not exist.
- Bootstrap no longer creates/updates stock `ee-supported-*` Controller execution environments (already present in AAP/Hub). Hub EE push stays opt-in and refuses stock `ee-supported-*` images — only custom local images (for example `ado-ee`) are pushed when explicitly enabled.
- Added Git Configuration TLS/SSL skip control (default disabled verification) for UI and CLI; sets local `git config http.sslVerify false` when skip is enabled.
- When SCM tool is Bitbucket, git clone/push uses `http.extraHeader='Authorization: Bearer <token>'` instead of GitLab-style `oauth2:<token>` basic auth.
- Hub EE push always uses a local podman image only (never pulls from the internet); the image must already exist locally before enabling push.
- Added an AAP Configuration Galaxy tab to optionally create Hub/Galaxy API Token credentials, a Container Registry EE credential, a Controller user account, and attach Galaxy credentials to the organization (default off for disconnected).
- Fixed OpenShift Virt VM provisioning so missing `provision_openshift_virt_skip_tls_verify` no longer fails the job; it defaults to `true` in the playbook and job template extra vars.
- Added an optional AAP Hub tab control to push the local `ado-ee` image to Private Automation Hub; it defaults to off and is skipped unless explicitly enabled.
- When Hub EE push is enabled, the AAP Execution Environment field becomes a dropdown defaulting to the pushed EE name (switchable back to `ee-supported-rhel9`); when push is off it stays the normal default.
- Added Satellite manifest ZIP upload to the Satellite configuration form and increased the bootstrap API payload limit so uploaded manifests can be written into the generated repo `files/` directory.
- Fixed provision bootstrap so selecting Provision / `openshift_virt` reliably creates the `{org} | Provision OpenShift Virt VM` AAP job template, including when only the Provision group is selected.
- Added Satellite manifest ZIP upload to the Satellite configuration form and increased the bootstrap API payload limit so uploaded manifests can be written into the generated repo `files/` directory.
- Added a dedicated Credentials card above Git Configuration with Vault, Machine, and Additional tabs, and moved vault credential fields out of the AAP Configuration card.
- Clarified AAP Hub collection update wording and moved Hub update state into the ADO Bootstrap Recap AAP Hub section, removing the redundant installed collection line.
- Added pre-run validation for AAP Hub publishing so collection-only runs stop immediately when AAP OAuth token or admin password auth is missing.
- Fixed AAP Hub update-only runs so they still invoke the AAP apply path and publish the bundled infra.ado collection, and show Hub publish/force/update-only states in the recap.
- Added an unchecked AAP Hub "Update collection only" mode so infra.ado can be published without generating component bootstrap content.
- Bootstrap components are no longer preselected by default; operators must choose the components they want or use collection-only mode.
- AAP Hub publishing now stages a source tree with `galaxy.yml` from the bundled infra.ado collection artifact before calling the Hub publish role.
- Added an AAP Hub force-update option for the `infra.ado` collection and pass it through the preflight payload.
- The runtime now installs the highest-version bundled `infra-ado-*.tar.gz` with `--no-deps`, preventing stale `1.0.0` installs from hiding newly added roles.
- The runtime now installs the bundled `ansible.hub` collection when present so AAP Hub publishing can run `ansible.hub.ah_build`.


All notable changes to the ADO Preflight UI are documented in this file.

## 1.0.0 - 2026-07-11

### Added

- Added IDM install options for DNS, AD trust, certificate services, custom certificates, replica hostname, replica DNS/CA install toggles, and auto forwarders.
- Added Satellite field help tooltips with examples for hostname/URL, organization, activation key, service account, dynamic inventory, inventory source behavior, and TLS behavior.
- Added an ADO Bootstrap Recap at the end of UI runs with AAP server, organization, selected components, project, generated job templates, workflows, credentials, inventories, and installed `infra.ado` collection status.
- Added AAP TLS certificate verification control so self-signed controller certificates can be skipped from the UI and passed into the bootstrap run.
- Added OpenShift TLS certificate verification control, defaulting to skip verification for self-signed OpenShift API certificates.
- Added AAP additional credential entry support with tabbed credential forms.
- Added AAP Hub publishing control for the `infra.ado` collection, with validated content handling tied to the same setting.
- Added organization-based AAP object naming defaults for inventory, project, vault credential, job templates, and workflow templates.
- Added organization-based AAP label generation so generated automation can be
  filtered by an organization label such as `ADO`.
- Added machine credential SSH key inputs for RHEL, Satellite, and patching workflows.
- Added Satellite service account fields for Satellite configuration.
- Added Satellite dynamic inventory configuration fields for AAP inventory sources.
- Added inline Satellite dynamic inventory guidance showing that the source is
  created under the organization RHEL inventory.
- Added Satellite install fields for deployment version, install location, RHN
  organization ID, RHN activation key, sizing profile, and storage mount rows.
- Added RHEL patching survey inputs for reboot behavior, package list, package state, exclusions, disabled repositories, cache refresh, kernel cleanup, and skip-broken handling.
- Added RHBK configuration tabs for selected resources such as client, IDP, group mapper, client scopes, and federation.
- Added UI version, image, tag, pod, and Node runtime details to the collections dialog.
- Added ADO Collection Documentation and ADO Preflight UI Documentation entries under the help menu.
- Added markdown rendering for in-app documentation.
- Added JSON import in Core Environment Information so saved preflight payloads can repopulate the UI.
- Added an Additional RHEL Hosts textarea so UI runs can populate
  `component_config.rhel.hosts` for the generated RHEL inventory.
- Added clickable ADO role README links in the in-app collection documentation
  modal.
- Added OpenShift admin HTPasswd, console banner, and cert-manager source
  fields so UI runs can drive the generated OpenShift bootstrap workflow.
- Added OpenShift Options for Admin HTPasswd and Console Banner so those
  optional settings render as tabs only when selected.
- Added an OpenShift Agent Installer Config option with an Agent Installer tab
  that validates cluster, network, VIP, pull-secret, SSH key, topology, and node
  input before generating `install-config.yaml` and `agent-config.yaml`.
- Added Agent Installer YAML preview and ZIP download actions so operators can
  download both generated OpenShift agent-based installer files from the UI.
- Added browser-local Agent Installer profiles with save, load, clone, and
  delete actions for reusable OpenShift cluster definitions.
- Added an independent OpenShift Virtualization VM provisioning form under the
  Provision tab, including API credentials, VM image, namespace, instance type,
  storage, cloud-init user, SSH public key, and start behavior.
- Added click-to-open field help popups with examples across OpenShift, RHEL,
  Satellite, IDM, RHBK, Grafana, Compliance, STIG, and related component forms.
- Added nested Events / Debug console tabs for summary data, preflight JSON,
  extra vars, generated repo tree, generated configs, runtime details, and
  terminal access guidance.
- Added console text zoom controls for Logs and Events / Debug output.
- Added OpenShift Virtualization launch-survey coverage for VM namespace, image, CPU, memory, disk, static networking, passwords, root SSH, and start/wait behavior.

### Changed

- OpenShift LDAP, OAuth/RHBK, route discovery, and pull secret automation now
  have dedicated option checkboxes instead of being generated for every
  OpenShift run.
- OpenShift API Token help now includes service account creation, cluster-admin binding, and long-lived token commands for `ansible-sa`.
- IDM configuration no longer shows or exports a storage field.
- Satellite TLS handling now uses the same "Skip TLS certificate verification for self-signed certificates" wording as AAP and remains skipped by default.
- The AAP Machine Credential SSH private key textarea is editable immediately so keys can be pasted without first toggling secret visibility.
- The generated payload now keeps selected component configuration only, instead of sending unselected or blank component sections.
- Single component selections now stay selected correctly when preparing bootstrap payloads.
- RHEL and Satellite configuration no longer show the OpenShift-only storage field.
- Moved the AAP Hub publishing and TLS verification controls below the AAP entry fields.
- Additional credential removal now targets the selected credential instead of removing the wrong entry.
- Additional credentials now render as tabs instead of stacking multiple large cards on the main page.
- The UI README was rewritten as an operator-focused guide for first-time ADO and UI users.
- The runtime container now copies the UI README and extracts the ADO collection README from the packaged `infra-ado` collection tarball for in-app documentation.
- The UI README now documents component-specific AAP inventories, generated
  patching/RHEL/Satellite workflows, role README viewing, organization label
  behavior, and additional RHEL hosts.
- OpenShift cert-manager inputs are shown only when the cert-manager app is
  selected, with custom certificate, IdM ACME, and AWS PCA source options.
- OpenShift admin HTPasswd and console banner values are omitted from UI
  payloads unless their OpenShift Options checkboxes are selected.
- Component form field help now opens on click instead of hover so examples
  stay visible while operators read or copy values.
- Component selection and option checkboxes no longer show help markers; help is
  limited to actual form fields and settings.
- The final UI console output now shows RESULT before the ADO Bootstrap Recap so
  the recap is easier to read after the returned run payload.
- OpenShift Virtualization preflight input now only collects OpenShift API host, API token, TLS verification, and SSH public key; VM sizing and guest settings are selected from the AAP launch survey.

### Fixed

- Exported preflight JSON now keeps top-level component selections in
  `selected_component_apps` for legacy compatibility, so OpenShift option-only
  changes do not get collapsed to just the selected child app.
- RHBK IDP and 389ds federation playbooks and AAP job templates are now only
  generated when their matching RHBK options are selected.
- OpenShift option payloads such as Console Banner and Admin HTPasswd now stay
  in exported/run JSON when OpenShift is selected with child apps like RHBK, so
  generated playbooks and AAP job templates are created for those options.
- Bootstrap runs now preserve OpenShift option-derived components on the server
  side, so Console Banner and OAuth/RHBK selections generate OpenShift
  playbooks and AAP job templates during `Run Bootstrap`.
- OpenShift API host, apps domain, TLS verification, and API token fields now always render on the main OpenShift configuration tab when OpenShift is selected.
- Bootstrap runs now explicitly pass AAP apply flags so generated controller
  configuration is applied during UI runs.
- The ADO Bootstrap Recap now reads generated job template files from
  `configs/job_templates`, parses generated controller credentials,
  inventories, inventory sources, and hosts from their controller config roots,
  and falls back to normalized UI payload values when generated files are
  missing or empty.
- JSON import and export now hydrate selected Satellite and IDM configuration
  sections when older preflight files are missing `component_config.satellite`
  or `component_config.idm`, and selected Satellite defaults dynamic inventory
  creation on.
- JSON import now ignores stale `selected_component_apps` when richer
  `components` and `component_apps` selections are present, so older saved
  preflight files keep Satellite, IDM, Compliance, and STIG selections.
- Documentation modals no longer display raw JSON error bodies when a README is missing.
- Documentation endpoints now return readable markdown fallback text and log missing container paths to the server events.
- Documentation fetches now fail cleanly if a route returns a non-success response.
- Generated AAP controller configs are reloaded before apply so UI runs create
  the current split inventories, hosts, labels, job templates, inventory
  sources, and workflow templates instead of applying stale in-memory defaults.
- Generated workflow configs are now passed to the `controller_workflows`
  dispatcher variable so AAP creates workflow templates during UI runs.
- Generated job templates and workflow templates now receive the plain
  organization label, such as `ADO`, so AAP domain/filter views can show the
  organization grouping.
- Generated AAP project names now follow the same organization-prefixed naming
  pattern as the other AAP objects, so `test-project` under org `RH` becomes
  `RH-test-project`.
- Generated primary AAP Vault and Machine credential names now follow the same
  organization-prefixed naming pattern, so `test-vault` and `test-machine`
  under org `RH` become `RH-test-vault` and `RH-test-machine`.
- OpenShift UI payloads now write admin HTPasswd and console banner values into
  the OpenShift vars/vault files and cert-manager values into the cert-manager
  vars/vault files used by the generated playbooks.
- Generated primary AAP inventory names now follow the same organization
  prefixing, so `test-inventory` under org `RH` becomes `RH-test-inventory`.
- OpenShift runs now clear stale inactive RHEL/Satellite selections before
  submitting JSON, so an earlier Satellite dynamic inventory choice does not
  make a later OpenShift run require Satellite service account fields.
- Generated workflow labels now use the AAP configuration role's supported
  top-level label format, fixing workflow template creation failures.
- The bootstrap recap now reports the generated AAP project name from
  `configs/controller/projects.yml` so it matches the object created in AAP.
- Role README links in the ADO Collection Documentation now work in the running
  container because the UI image extracts role documentation from the packaged
  `infra.ado` collection, and the server can extract it on demand if missing.

## 1.0.0 - 2026-07-10

### Added

- Added initial component configuration support for selected bootstrap components.
- Added UI support for Git branch, Git token, automatic commit and push, and bootstrap execution options.
- Added collection and local Ansible tool visibility in the collections dialog.
- Added support for passing UI selections into the same bootstrap roles used by CLI runs.

### Changed

- Standardized bootstrap generation around the unified `infra.ado` collection when present.
- Improved component option handling so UI-generated runs align with CLI bootstrap variables.
