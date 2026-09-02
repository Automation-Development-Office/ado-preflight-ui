# ADO Preflight UI Changelog

## 1.2.0

### Minor Changes

- 7dac493: Git overwrite and Skip TLS help moved to `?` popovers; optional Nodes Form modal for Agent Installer; Additional Environments survey field; scoped `group_vars` refresh unless overwrite is enabled; Not using AAP shows the local ansible-playbook the pod will run and accepts additional CLI options (`ansible.extra_args`); bootstrap honors `aap.enabled=false` by disabling AAP apply/config generation.
- 4701038: ACS form option to deploy RHACS vulnerability report job templates and workflow (`acs_report`).
- 4701038: Add a thin Airgap Architect adapter (`POST /api/airgap-architect/map` plus Agent Installer handoff buttons), default Hub EE image name to registry-safe `ado-ee` (Contoller EE can stay `ADO-ee`), and GitLab/Grafana standalone config panels with lab hostname/IP/password defaults.
- 7c77efa: Add AWS platform component with EC2 AMI copy bootstrap configuration (shared AWS credentials, ec2_ami_copy job options, and component_apps/component_options wiring).
- 976eb1b: Add **Deploy to OpenShift** (Actions menu): `deploy/deploy.sh` + `deploy/preflight.yaml`, async `POST /api/deploy/openshift`. Mounts kubeconfig/podman socket in `restart_pod.sh` for local testing.
- adc9db0: AAP Hostname URL now keeps Hub Galaxy credential Server URLs (and the Hub container registry host when unset) in sync; Hub EE push gains an optional remote pull from GitHub Container Registry (`hub_ee_pull`) instead of requiring a local-only image.
- 4701038: Clarify Galaxy tab (separate Contoller user vs admin; Shared token falls back to General). Add org Galaxy credential order controls. Name downloads hub-galaxycreds when Galaxy is enabled. Ship infra.ado 1.1.2 so hub-only applies Galaxy credentials before stop.
- 4701038: Hub-only / EE push now always ensures the General Contoller org exists and creates/attaches a Container Registry credential so ADO-ee pulls stop ImagePullBackOff. Checking collection publish, Push EE, or Run Hub updates only also enables Galaxy/registry credential setup.
- bb8955a: Git TLS skip control, Bitbucket Bearer git auth, optional Hub EE push and Galaxy credential setup, Satellite manifest upload, Credentials card, Hub collection force/update-only modes, provision/OpenShift Virt fixes, Changesets-based release notes, and GHCR tagging that always uses the release tag and only applies `:latest` for non-prerelease stable X.Y.Z versions.
- 976eb1b: Add embedded **Pod Terminal** under Events / Debug (xterm.js + WebSocket shell in `/workspace`). Disable with `ADO_PREFLIGHT_TERMINAL_ENABLED=false`.
- 976eb1b: - ACM tab: operator channel only (drop unused hostname/replicas/namespace/storage).
  - ACS tab: editable Central route hostname, storage class, optional policy/report sources; namespace read-only.
  - OpenShift OAuth/RHBK and LDAP options get config tabs with IdP display name fields.
- 976eb1b: - **Discover Routes and Print** — optional scope: all routes, explicit namespaces, or namespaces derived from selected OpenShift apps.

  - **Alternate Routes** — replaces “Discover Routes and Add Alternative Route”; enables **Alt Routes Workflow** with:
    - Print Alternate Routes
    - Add Alternate Route (suffix, labels, force replace)
    - Add Ingress with Route (ingress controller name + router label)

  Legacy exports using `discover_routes_alt` are migrated to `alternate_routes` on import.

### Patch Changes

- 4701038: Add AAP 2.7 to the version selector, pass `aap_version=27` into bootstrap, and map Install AAP operator channel to `stable-2.7-cluster-scoped`.
- 4701038: Default AAP version to 2.7 and warn that Install AAP reuses an existing cluster-scoped operator instead of creating a second OperatorGroup.
- 4701038: Add an Install AAP operator scope control (all namespaces vs namespaced) and show it in the bootstrap recap.
- 4701038: Fix Install AAP RHN licensing: optional subscription ID field and wiring so bootstrap attaches a pool after install instead of leaving the AAP wizard unlicensed.
- 4701038: License tab warns to populate General → AAP Hostname and Admin password before attach; Download JSON uses `attach-aap-license` instead of `install-aap-ocp` for license-only runs.
- 851ac2a: AWS EC2 AMI copy: scaffold only in preflight UI; run-time copy options stay on the AAP job template survey (patching-style).
- 976eb1b: Split Quay, MinIO, Dev Hub, BookStack, NetBox, and Zabbix auth into optional workflow steps (Grafana pattern). Preflight checkboxes gate generation; RHBK co-selection auto-enables OIDC/SAML options.
- 976eb1b: Add per-tab help text under Events / Debug and header comments in debug API responses explaining what each troubleshooting view shows.
- 4701038: Name Download JSON `ado-preflight-<env>-install-aap-ocp.json` when Install AAP on OpenShift is selected, instead of a bare env filename.
- 4701038: Add Actions → Download scrubbed JSON that redacts passwords, tokens, kubeconfig, manifests, and base64 blobs for safe sharing.
- 8008840: Add prod to Additional Environments (default checked), stop leftover Install AAP JT when Install AAP is off, move collection install to a script file so logs no longer dump ERROR! script text, and warn when Hub collection update is disabled.
- 976eb1b: Fixed hub-only / prod bootstrap regression when Git token is empty: `ansible-playbook` line continuation dropped `--vault-password-file` (vault decrypt failed, exit 127 `-e: command not found`). Optional env `group_vars` load when overwrite refreshes a single env dir.
- 8008840: Generated Controller `collections/requirements.yml` now pins `infra.ado` to the preflight tarball version (currently 1.0.10) instead of stale 1.0.3, so project sync can install the collection Hub actually has.
- 8008840: Fix Contoller/patching bootstrap wrongly requiring OpenShift auth when Install AAP was sticky or selected, preserve OpenShift token when Install AAP is on without an OpenShift component, fail fast with a clear message, and only stage ado-source when Hub publish is requested.
- 8008840: Fixed a React crash on Satellite Client Tools / Satellite Config when `component_config.satellite` was missing (`validate_certs` on undefined). The form now hydrates satellite defaults when those options are selected.
- 8008840: Fixed bootstrap failing with `--vault-password-file: command not found` when Ansible extra args were empty (line continuation dropped the vault password file off `ansible-playbook`).
- 4701038: Fix hub-only Galaxy credentials: reload aap_config_vars before apply (stale configs/controller was skipping create/attach). Clarify per-cred org attach checkbox. Ship infra.ado 1.1.3 + updated docker overlays.
- 4701038: Add Grafana option to deploy a shared Openshift folder with K8S Prod/Dev datasource dropdown alongside OpenshiftProd and OpenshiftDev folders.
- 976eb1b: Autofill Grafana OIDC client ID and issuer from RHBK when both components are selected; client secret is fetched at deploy (same as OpenShift OAuth) unless manually overridden.
- 4701038: Treat Hub collection update as opt-in: default off, clearer optional labeling, and stop implying republish is required when infra.ado already exists on Hub.
- 4701038: Clarify Hub tab copy (General required, install-or-update collection, force overwrite, Hub-only runs), default EE names to ORG-ee, improve EE description, and allow Hub-only with collection and/or EE push without forcing a collection overwrite.
- 4701038: Ship infra.ado 1.1.1 and fix Hub EE overlay set_fact self-reference; also overlay apply_aap_25_plus so hub-only creates the General Contoller org.
- 8008840: Stop pinning infra.ado in generated requirements and bootstrap extra-vars; install whichever infra-ado-\*.tar.gz is newest in collections/ and let Hub/Contoller take latest.
- 4701038: Keep OpenShift API host/token when Install AAP is on without an OpenShift component, add an AAP version selector on Install / Run, and link back to Core Environment Git Configuration.
- 4701038: Install AAP no longer auto-selects the AAP platform component or requires Using AAP. Install settings stay on the Install / Run card, with an optional checkbox to configure Controller after the new AAP is up.
- 4701038: When Hub collection update is off, do not write Galaxy requirements.yml and pass that flag into bootstrap so Contoller project sync does not require Hub.
- 36c89ac: Documented the GitHub Release, Changesets, and GHCR tagging process in docs/RELEASING.md.
- faf3d65: Release workflow prepares `vendor/ado-ee.docker.tar` from GHCR before the container build (required by Containerfile).
- 976eb1b: Restore Actions → Download Vault JSON / Push Vault JSON to Git / Upload JSON → Push Vault to Git. Encrypts with ansible-vault as `ado-preflight-<env>.json.vault.yml` and pushes to the Project Git repo from Git Configuration.
- 976eb1b: Hub-only and standalone AAP runs ignore imported `git.auto_push: true`; server normalizes to false, collection forces manual git mode, and vault encrypt duplicate-id fix is included.
- 4701038: Add a Storage Class Look up button that lists classes from OpenShift when API host and token are set.
- 4701038: Vendor kubernetes.core and redhat.openshift from the lab Hub into the preflight collections directory, and install the Python Kubernetes client in the UI image so Install AAP can call kubernetes.core.k8s.

This project uses [Changesets](https://github.com/changesets/changesets).
Add a file under `.changeset/` for user-visible changes (`npx changeset`).
Do not edit this file directly in normal PRs — official releases compile
changesets into `CHANGELOG.md` and open a PR that removes consumed files.

## Unreleased

Pending changes live in `.changeset/` until the next official GitHub Release.

Notable pending items:

- Thin **Airgap Architect** adapter (`POST /api/airgap-architect/map`) with Agent
  Installer “Map to Airgap Architect” / handoff JSON download; optional
  `AIRGAP_ARCHITECT_URL` remote generate.
- Hub EE registry image default **`ado-ee`** (lowercase); Contoller EE name can
  remain org-scoped (`ADO-ee`).
- **GitLab** / **Grafana** standalone config panels (lab hostnames, passwords,
  IP notes `192.168.0.65` / `.66`).

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
