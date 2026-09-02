# ADO Pre-Flight UI

🧭 **A guided web UI for generating ADO bootstrap automation for Ansible Automation Platform, RHEL, Satellite, OpenShift, and related platform components.**

The ADO Pre-Flight UI is a containerized questionnaire that turns a set of environment answers into a working bootstrap repository. It can generate environment variable files, vault files, playbooks, controller configuration, AAP credentials, inventories, projects, job templates, workflow templates, and optional Git commits.

This README assumes you have never used ADO or this UI before.

For maintainers: see [docs/RELEASING.md](docs/RELEASING.md) for creating GitHub Releases, GHCR image tags, and Changesets. See [docs/ADO_DEVELOPMENT_MODEL.md](docs/ADO_DEVELOPMENT_MODEL.md) for the development workflow (boundaries, changelogs, lint, tests).

---

## 🧩 What This UI Does

The UI asks for the same information you would normally collect before building an ADO automation repository by hand:

- Environment name, such as `dev`, `test`, `preprod`, or `prod`
- Base domain, such as `prod.rhlab`
- Bootstrap components, such as RHEL, Satellite, RHBK, Grafana, Kafka, GitLab, IDM, or OpenShift
- Component-specific settings, such as hostnames, storage classes, service accounts, profile selections, and tokens
- Git repository settings for the generated bootstrap repo
- AAP connection details and AAP object names
- Credential information that should be created in AAP
- Whether to push generated content to Git

When you run bootstrap, the container writes a preflight JSON file and runs Ansible inside the container. The Ansible roles use that JSON to generate the repository content and optionally apply AAP configuration.

---

## 🏗️ What ADO Means Here

ADO stands for **Automation Development Office**. In this repository, ADO is a structured automation framework that keeps generated automation predictable:

- `group_vars/all/<env>/` stores environment variables and vault files.
- `playbooks/<component>/` stores generated playbooks for selected components.
- `configs/controller/` stores AAP controller objects such as organizations, credentials, inventories, projects, and execution environments.
- `configs/job_templates/` stores AAP job template definitions.
- `configs/workflows/` stores AAP workflow template definitions.

The UI does not replace the ADO roles. It collects answers and runs the ADO bootstrap roles for you.

---

## 🚦 Normal Workflow

1. Start the ADO Pre-Flight UI container.
2. Open the UI in a browser.
3. Fill in the environment and component selections.
4. Configure Git.
5. Configure AAP.
6. Add any required credentials.
7. Preview or download the JSON if desired.
8. Run bootstrap.
9. Review logs and events.
10. Validate generated files, Git, and AAP objects.

---

## 🧰 Requirements

You need:

- Podman on your workstation or jump host
- Network access to your Git repository if Git push is enabled
- Network access to AAP if AAP configuration is enabled
- AAP admin username/password or OAuth token
- A vault password for generated vault files
- Optional Git token if the UI should push generated content

Recommended:

- A clean Git repository for generated bootstrap content
- A known target branch, such as `main` or `production`
- A service account for Satellite if Satellite dynamic inventory is used
- SSH private key material if RHEL, Satellite, or patching jobs need a machine credential

---

## 🚀 Start The UI

Pull or build the UI image, then run it with Podman.

```bash
podman run --rm -d \
  --name ado-preflight-ui \
  -p 8080:8080 \
  ghcr.io/automation-development-office/ado-preflight-ui:latest
```

Open:

```text
http://127.0.0.1:8080
```

View container logs:

```bash
podman logs -f ado-preflight-ui
```

Stop the UI:

```bash
podman stop ado-preflight-ui
```

---

## 🖥️ Main Screen

The UI is a single-page form. The major areas are:

- **Core Environment Information**
- **Bootstrap Components**
- **Component Configuration**
- **Git Configuration**
- **Ansible Automation Platform Configuration**
- **Actions / Run Output**
- **Collections and Local Ansible Tools**

You can use the UI from top to bottom. The selected components determine which component configuration tabs are shown.

---

## 🌎 Core Environment Information

### Environment Type

This is the environment name used for generated files.

Example:

```text
prod
```

Generated files will be placed under:

```text
group_vars/all/prod/
```

Use a short value such as:

- `dev`
- `test`
- `preprod`
- `prod`

### Additional Environments

Optional space- or comma-separated environment names that should also appear in
generated AAP job/workflow survey choices. Leave blank or set to `none` when
only the primary Environment Type should be offered.

Example:

```text
dev test
```

With Environment Type `prod`, surveys get choices for `prod`, `dev`, and
`test` instead of a hardcoded environment list.

### Base Infrastructure Domain

This is the base DNS domain for the environment.

Example:

```text
prod.rhlab
```

The UI and roles use this value to derive related hostnames and defaults.

---

## 🧱 Bootstrap Components

This section controls what gets generated.

### Top-Level Components

You can select groups such as:

- `all`
- `openshift`
- `rhel`
- `patching`
- `provision`

Selecting a top-level group opens component-specific choices.

### Install vs configure (OpenShift / RHEL)

Bootstrap generates install and/or configure playbooks (and AAP job templates)
per component. ✅ = supported today. ❌ = not in the generated bootstrap path.

**Install** (deploy / stand up the product):

| Component | OpenShift | RHEL / Linux |
|-----------|:---------:|:------------:|
| AAP | ✅ | ❌ |
| ACS (RHACS) | ✅ | ❌ |
| ACM | ✅ | ❌ |
| Cert Manager | ✅ | ❌ |
| Dev Spaces | ✅ | ❌ |
| Directory Server (389) | ✅ | ❌ |
| ECK / Elastic | ✅ | ❌ |
| GitOps | ✅ | ❌ |
| GitLab | ✅ | ❌ |
| Grafana | ✅ | ❌ |
| Kafka | ✅ | ❌ |
| OADP | ✅ | ❌ |
| OpenShift (base cluster) | ❌¹ | ❌ |
| PEGA | ✅ | ❌ |
| Quay | ✅ | ❌ |
| RHBK | ✅ | ❌ |
| Satellite | ❌ | ✅ |
| IdM | ❌ | ✅ |
| RHEL / patching / compliance / STIG | ❌ | ❌² |
| OpenShift Virtualization (VM) | ✅ | ❌ |

**Configure** (day-0/day-2 after or instead of a full install):

| Component | OpenShift | RHEL / Linux |
|-----------|:---------:|:------------:|
| AAP (Controller / gateway objects) | ✅³ | ✅ |
| ACS (deploy+configure, reports, policies) | ✅ | ❌ |
| ACM | ✅ | ❌ |
| Cert Manager (issuers, AWS PCA) | ✅ | ❌ |
| Console banner / LDAP / OAuth / routes / pull secret / CSI | ✅ | ❌ |
| Dev Spaces | ✅ | ❌ |
| Directory Server | ✅ | ✅ |
| ECK / Elastic | ✅ | ✅ |
| GitOps | ✅ | ❌ |
| GitLab | ✅ | ✅ |
| Grafana (OIDC, dashboards, folders) | ✅ | ✅ |
| Kafka | ✅ | ✅ |
| OADP | ✅ | ❌ |
| Quay | ✅ | ❌ |
| RHBK (realm, client, IdP, federation) | ✅ | ✅ |
| Satellite (configure, content view, client reg) | ❌ | ✅ |
| IdM (client, DNS, AD trust, settings, sudo) | ❌ | ✅ |
| RHEL patch / compliance / STIG | ❌ | ✅ |

¹ Cluster is assumed to exist; agent-based install-config is a separate Install / Run path, not a generated OpenShift “install cluster” JT.  
² Patching/compliance/STIG harden existing hosts; they do not install RHEL.  
³ AAP install is on OpenShift; “Using AAP” configures Controller objects against that AAP URL (not a RHEL host install).

> Some apps (AAP, Grafana, RHBK, …) appear under the RHEL group in the UI for convenience, but their generated playbooks target **OpenShift** only.

### RHEL Components

RHEL includes components such as:

- RHEL
- Satellite
- IDM
- AAP
- Directory Server
- ECK
- GitLab
- Grafana
- Kafka
- RHBK
- Compliance
- STIG

Only selected RHEL components should generate directories and config files.

### OpenShift Components

OpenShift includes platform and application components such as:

- AAP
- ACS
- ACM
- Cert Manager
- Console
- DevSpaces
- Directory Server
- ECK
- GitOps
- GitLab
- Grafana
- Kafka
- OADP
- OpenShift
- PEGA
- Quay
- RHBK

### Patching Components

Patching currently works with:

- RHEL patching
- Satellite
- IDM

### Selected-Only Behavior

The UI intentionally sends only selected components in the generated preflight JSON. If Grafana is not selected, Grafana config should not be included in the generated payload. If a stale generated directory exists from a previous run, the bootstrap roles remove stale generated component vars and vault files for unselected components.

---

## 🧾 Component Configuration

After selecting components, use the **Component Configuration** tabs to fill in component-specific variables.

### RHEL

RHEL configuration includes:

- RHEL component selection
- Compliance profile
- STIG profile
- RHEL hostname
- Additional RHEL hosts
- Optional machine credential configuration

The first RHEL hostname is written to `component_config.rhel.hostname`.
Additional RHEL hosts are written to `component_config.rhel.hosts`, one host
per line. The generated AAP config places those hosts in
`<organization>-RHEL-Inventory`.

RHEL no longer asks for storage. Storage is only relevant to OpenShift-style
components.

### Satellite

Satellite configuration includes:

- Satellite hostname or URL
- Satellite organization
- Activation key
- Satellite deployment version, with `6.17`, `6.18`, and `6.19` options
- Satellite install location, such as `AWS` or a datacenter name
- RHN organization ID from Red Hat Hybrid Cloud Console
- RHN activation key for registering the Satellite host
- Satellite sizing profile, such as `default`, `medium`, `large`,
  `extra-large`, or `extra-extra-large`
- Satellite storage mount rows with `mount_point`, `lv_name`, and `lv_size`
- Service account username
- Service account password
- Admin password
- TLS validation choice
- Dynamic inventory settings

Satellite no longer asks for an OpenShift storage class. Satellite install
storage uses LVM mount rows that map to `satellite_install_satellite_req_dirs`.

If dynamic inventory is enabled, the generated AAP controller config includes a Satellite 6 inventory source.
The Satellite server host is placed in
`<organization>-Satellite-Server-Inventory`. The Satellite dynamic inventory
source is attached to `<organization>-RHEL-Inventory` because the hosts returned
by Satellite are managed RHEL targets.

### RHBK

RHBK configuration includes:

- Hostname / URL
- Storage class
- Realm
- Selected RHBK options

When these options are selected, additional tabs appear under RHBK:

- **Client**
- **IDP**
- **Group Mapper**
- **Client Scopes**
- **Federation**
- **Client Mappers**

Each tab exposes the values needed for that RHBK area, such as client IDs, redirect URIs, IDP aliases, discovery URLs, LDAP federation values, mapper names, and claim names.

### OpenShift

OpenShift configuration includes base connection settings:

- OpenShift API host
- OpenShift apps domain
- OpenShift API token
- Skip TLS certificate verification

Optional OpenShift configuration is controlled from **OpenShift Options**. When
`Admin HTPasswd` is checked, the UI shows an Admin HTPasswd tab for username,
password, and role. When `Console Banner` is checked, the UI shows a Console
Banner tab for text, location, background color, and text color. Unchecked
options are omitted from the generated preflight payload so the CLI/bootstrap
path does not create those settings by default.

The OpenShift skip TLS option defaults to enabled for self-signed environments.
Cert-manager can be configured for a custom certificate, IdM ACME, or AWS PCA
when the `cert_manager` app is selected.

#### Agent Installer Config

When `Agent Installer Config` is checked under **OpenShift Options**, the UI
shows an **Agent Installer** tab. This tab generates OpenShift agent-based
installer files without requiring operators to hand-edit YAML.

The tab collects:

- A browser-local profile name for saving, loading, cloning, and editing
  reusable cluster profiles
- Cluster name, base domain, OpenShift version, topology, pull secret, and SSH
  public key
- Machine, cluster, and service network CIDRs
- API VIP, ingress VIP, rendezvous IP, optional boot artifacts URL, and NTP
  sources
- Optional proxy, trust bundle, and disconnected registry image content source
  settings
- Any number of nodes with hostname, role, MAC address, interface, DHCP/static
  network mode, static IP details, DNS servers, root disk hints, labels, and
  taints
- Optional per-node **Form** modal for filling the same fields in a vertical
  layout when the wide table is awkward to type into

Actions on the tab:

- **Save Profile** stores the current Agent Installer form in browser local
  storage.
- **Clone Current Profile** copies the current profile so it can be edited
  without overwriting the original.
- **Validate Configuration** checks required fields, CIDRs, VIP placement,
  pull-secret JSON, SSH key format, duplicate hostnames, duplicate MACs,
  duplicate static IPs, and SNO/HA topology rules.
- **Generate YAML Preview** renders `install-config.yaml` and
  `agent-config.yaml` in the browser.
- **Download ZIP** downloads both generated YAML files together.
- **Map to Airgap Architect** / **Download Architect handoff JSON** call
  `POST /api/airgap-architect/map`. This is a thin adapter (not an embedded
  Architect UI): it maps the Agent Installer form to OpenShift Airgap Architect
  Bare Metal Agent-Based wizard state, regenerates install/agent YAML via the
  existing generator, and returns an oc-mirror ImageSetConfiguration stub
  (platform baremetal/agent, empty operators, OCP version from the form).
  When the server env `AIRGAP_ARCHITECT_URL` is set, the adapter also POSTs the
  mapped state to `${AIRGAP_ARCHITECT_URL}/api/generate` and includes the remote
  response / diff summary. When unset, mapping is local-only.

This generator is intentionally separate from the normal bootstrap run. It is
used to prepare OpenShift installer input files. Future work can add ISO
generation, PXE export, hardware inventory import, and GitOps export.

### Grafana

Grafana configuration includes:

- Hostname / URL (lab default `grafana-ado.server.lab`)
- Storage class
- Standalone RHEL option (inventory note `192.168.0.66`, admin password
  `redhat123`, optional airgap RPM path/URL) — similar to RHBK standalone
- Dashboard folders, email/SMTP, and OIDC

### GitLab

GitLab configuration includes:

- Hostname / URL (lab default `gitlab-ado.server.lab`)
- Storage class / replicas for OpenShift operator installs
- Standalone RHEL Omnibus option (inventory note `192.168.0.65`, root password
  `redhat123`, CE/EE edition, optional airgap RPM path/URL)

### Hub EE image name

Hub registry image name defaults to lowercase `ado-ee` (registry-safe). The UI
label remains **ADO EE**. The Contoller execution environment object name can
remain org-scoped (`ADO-ee` / `ORG-ee`) as a separate field.

### Contoller collections without ADO EE

When job templates use a stock EE (`ee-supported-rhel9`) instead of ADO EE,
Contoller only installs `collections/requirements.yml` (including the local
`type: dir` vendored `infra.ado`) if the **organization already has Galaxy
credentials** attached in Contoller.

Quick start: attach Galaxy credentials once (preflight Galaxy tab, or Contoller
UI). You do **not** need to re-check the Galaxy tab on every bootstrap if they
are already on the org. Push ADO EE is the other option when you want
`infra.ado` baked into the EE.

### IDM

IDM configuration includes:

- Hostname
- Domain
- Realm
- Admin password
- Directory Manager password
- Optional AD Trust settings (forest/realm, AD admin password, one-way or
  two-way trust, and AD group mapping for SSH/sudo)

Selecting IdM AD Trust drives collection role `infra.ado.idm_ad_trust` and the
`ADO | IdM Manage AD Trust` job template.

### Compliance and STIG

Compliance and STIG configuration includes profile selection only. These do not require storage.

---

## 🔐 Credentials

### AAP Vault Credential

The UI creates a vault credential in AAP. By default, object names are based on the AAP organization.

If organization is:

```text
ADO
```

Defaults become:

```text
ADO-inventory
ADO-project
ADO-vault
ADO-machine
```

If organization is:

```text
MYORG
```

Defaults become:

```text
MYORG-inventory
MYORG-project
MYORG-vault
MYORG-machine
```

### Machine Credential

RHEL, Satellite, and patching workflows can use a machine credential for SSH. The UI can collect:

- Credential name
- SSH username
- SSH private key
- Private key passphrase
- Become method
- Become username

Secret values are written through vault files.

### Additional AAP Credentials

The **Add Additional Credentials** panel lets you add extra credentials that should be created in AAP.

Click **Add Credential** to create a new credential tab. Each credential appears in its own tab rather than stacking multiple cards on the screen.

Supported fields include:

- Credential name
- Credential type
- Host / URL
- Username
- Password
- Token
- Become method
- Become username
- SSH private key

The `X` button in the credential tab removes that credential.

### AAP Hub Validated Collection

The UI includes one checkbox:

```text
Add infra.ado collection to validated content in AAP Hub
```

When enabled, generated vars target the ADO collection at validated content. The current UI writes the needed intent and generated variables. Actual hub publish/import behavior still depends on having the hub endpoint and credentials available to the automation.

---

## 🧠 AAP Configuration

The AAP section controls whether the bootstrap should create or update AAP objects.

Choose **Using AAP** to configure controller/Hub settings and apply generated
AAP objects during bootstrap.

Choose **Not using AAP** when you only want local scaffolding. The UI shows the
`ansible-playbook` command the pod will run (with AAP apply/config generation
disabled) and an **Additional ansible-playbook options** box for optional flags
such as `-e some_var=value` or `--tags bootstrap`. Those values are stored as
`ansible.extra_args` and appended to the container bootstrap command.

When Using AAP, fields include:

- AAP hostname URL
- AAP version
- Organization name
- Inventory name
- Project name
- Execution environment
- Vault credential name
- TLS certificate verification
- OAuth token
- Admin username
- Admin password
- Vault password

### TLS Certificate Verification

If your AAP uses a self-signed certificate, select:

```text
Skip TLS certificate verification for self-signed certificates
```

This maps to the same behavior as running with:

```bash
-e ANSIBLE_TLS_VERIFY=false
```

### Organization-Based Names

The organization name drives the default names for generated AAP objects. Job templates and workflow templates are also prefixed with the organization.
Generated AAP labels also use the organization name, so an organization named
`ADO` creates the `ADO` label along with component labels such as
`ADO | rhel`, `ADO | satellite`, and `ADO | bootstrap`.

Examples:

```text
ADO | RHEL Patch Host
ADO | Patching Workflow
```

or:

```text
MYORG | RHEL Patch Host
MYORG | Patching Workflow
```

### Generated Inventories

The UI and CLI generate separate inventories so job templates target the right
systems:

- `<organization>-inventory` contains only `localhost`.
- `<organization>-RHEL-Inventory` contains static RHEL hosts and the Satellite
  dynamic inventory source when dynamic inventory is enabled.
- `<organization>-IDM-Inventory` contains IDM server and replica hosts.
- `<organization>-Satellite-Server-Inventory` contains the Satellite server
  host.

### Generated Workflows

When RHEL, Satellite, and IDM are selected together, the UI generates the
focused patching workflow:

```text
Register Host to Satellite
RHEL Patch Host
IdM Manage Client
```

When RHEL, Satellite, IDM, Compliance, and STIG are selected together, the UI
generates the RHEL workflow:

```text
Register Host to Satellite
RHEL Patch Host
IdM Manage Client
RHEL Compliance
RHEL STIG Hardening
```

When Satellite is selected, the UI generates the Satellite server workflow:

```text
Satellite Server Install
Satellite Server Configure
```

When OpenShift is selected, the UI generates an OpenShift workflow. It starts
with admin HTPasswd and console/cert-manager preparation, then includes the
selected OpenShift application job templates, such as RHBK, Grafana, GitLab,
Pega, Kafka, AAP, ECK, GitOps, 389ds, OADP, Quay, ACS, and ACM. Workflow nodes
for unselected apps are pruned before AAP apply, so partial OpenShift selections
remain valid.

---

## 🌿 Git Configuration

The Git section tells the bootstrap where generated content should live.

Supported Git providers:

- GitLab
- Bitbucket
- GitHub
- Other

Fields include:

- Git repository URL
- Git branch
- Git token
- Automatically commit and push generated content to Git
- Overwrite all generated content (all environments)
- Skip TLS/SSL verification for Git (self-signed certificates)

Field help uses the same clickable `?` popovers as the rest of the form.

### Git Branch

Use the real branch name for your generated bootstrap repo.

Examples:

```text
main
production
release/prod
```

The bootstrap uses this branch for project configuration and Git push behavior.

### Auto Push

If auto push is enabled, the bootstrap will:

1. Sync with origin before pushing.
2. Generate files.
3. Commit changes.
4. Push to the selected branch.

If auto push is disabled, the repo is generated locally in the container workflow and you can push manually.

### Overwrite generated content

Off (default): only refresh `group_vars/all/<environment>` for the selected
Environment Type. Sibling environments (for example `prod` when generating
`dev`) are kept.

On: delete all `group_vars`, `playbooks`, and `configs` before scaffolding.

### Git TLS verification

Skip TLS/SSL verification defaults to enabled for self-signed Git endpoints.
When checked, local git uses `http.sslVerify=false`.

---

## ▶️ Running Bootstrap

Use **Run Bootstrap** (or the action menu) after the form is complete.

The UI sends the selected-only preflight JSON to the backend. The backend writes that JSON into the container workspace and runs Ansible.

During the run, the UI shows:

- Ansible logs
- Event stream
- Exit status
- Generated output messages

If the run fails, check:

- AAP URL and credentials (when Using AAP)
- TLS verification setting
- Git URL, branch, and token
- Vault password
- Selected component values
- Network access from the container
- Additional ansible-playbook options entered under Not using AAP

---

## 📤 Downloading JSON

The action menu can download the generated preflight JSON.

This is useful for:

- Re-running from the CLI
- Reviewing exactly what the UI sent
- Sharing configuration between operators
- Debugging selected component behavior

The downloaded JSON should only include selected component config.

---

## 🧪 CLI and UI Compatibility

The UI and CLI use the same preflight JSON model. Anything important in the UI should map to generated role variables so command-line runs can use the same behavior.

Typical CLI-style flow:

```bash
ansible-playbook -i localhost, -c local run-ado-scaffolding.yml \
  -e env=prod \
  -e preflight_json=/path/to/ado-preflight-prod.json \
  --vault-password-file .vault_pass
```

The same JSON can be generated by the UI or created manually.

When **Not using AAP** is selected, the UI shows the exact `ansible-playbook`
command the pod will run (AAP apply/config generation disabled) and lets you
append optional flags via **Additional ansible-playbook options**
(`ansible.extra_args`), for example `-e some_var=value` or `--tags bootstrap`.

---

## 📁 Generated Repository Layout

A generated bootstrap repository normally contains:

```text
.
├── ansible.cfg
├── inventory
├── run-ado-scaffolding.yml
├── 00-controller-bootstrap.yml
├── group_vars/
│   └── all/
│       └── prod/
│           ├── aap_config_vars.yml
│           ├── aap_vault.yml
│           ├── vars_rhel.yml
│           ├── vault_rhel.yml
│           ├── vars_satellite.yml
│           └── vault_satellite.yml
├── playbooks/
│   ├── idm/
│   ├── rhel/
│   └── satellite/
└── configs/
    ├── controller/
    ├── job_templates/
    └── workflows/
```

The exact directories depend on selected components.

For RHEL and Satellite selections, generated playbooks can include:

- `playbooks/rhel/ado-patch-host-bootstrap.yml`
- `playbooks/rhel/ado-compliance-bootstrap.yml`
- `playbooks/rhel/ado-stig-hardening-bootstrap.yml`
- `playbooks/satellite/ado-register-to-satellite-bootstrap.yml`
- `playbooks/satellite/ado-install-satellite-bootstrap.yml`
- `playbooks/satellite/ado-configure-satellite-bootstrap.yml`
- `playbooks/satellite/ado-manage-content-view-bootstrap.yml`

---

## 🔒 Vault Files

Vault files hold secret values such as:

- AAP password
- AAP OAuth token
- Git token
- Vault credential password
- SSH private key
- SSH private key passphrase
- Satellite service account password
- Extra credential passwords and tokens

When vault encryption is enabled, generated vault files are encrypted with `ansible-vault`.

---

## 🔎 Collections and Local Ansible Tools Modal

Use the question mark menu in the top-right of the UI and choose **Show Collections**.

The modal shows:

- ADO Pre-Flight UI version
- Container image name
- Container image tag
- Pod/container hostname
- Node.js version
- Collections included in the container
- Collection versions
- Local tools expected in the container
- Runtime behavior

This helps confirm which UI image and collection set you are actually running.

## ❔ Field Help

Most component form fields include a `?` marker. Click the marker to open an
example-focused help popup for that field. Component selection checkboxes and
component option checkboxes stay clean, while form entries such as hostnames,
profiles, tokens, credentials, TLS settings, and inventory settings provide
field-level examples.

## 🔐 OpenShift Automation Service Account Token

OpenShift workflows need an API token when they create or configure cluster
resources. Create a dedicated `ansible-sa` service account, bind it to
`cluster-admin`, and generate a long-lived token.

```bash
oc create serviceaccount ansible-sa -n kube-system
oc adm policy add-cluster-role-to-user cluster-admin system:serviceaccount:kube-system:ansible-sa
export TOKEN=$(oc create token ansible-sa -n kube-system --duration=876000h)
echo $TOKEN
```

Paste the printed token into **OpenShift API Token**. The UI writes it into the
generated vault data so OpenShift playbooks can authenticate to the cluster.

The `--duration=876000h` example requests a long-lived token. Your cluster
policy may cap or reject long token durations; if that happens, use the longest
duration your OpenShift cluster allows.

## 🧰 Console Troubleshooting

The ADO Bootstrap Console includes **Logs** and **Events / Debug** tabs. The
Events / Debug area contains nested tabs for:

- Events
- Summary
- Preflight JSON
- Extra Vars
- Repo Tree
- Generated Configs
- Runtime
- Pod Terminal

The debug tabs are read-only and redact secret-looking values such as tokens,
passwords, vault values, and private keys. **Pod Terminal** opens an interactive
shell in the preflight pod/container (`/workspace`) via WebSocket + xterm.js —
useful for inspecting the bootstrap clone, vault files, and collections during
troubleshooting. Set `ADO_PREFLIGHT_TERMINAL_ENABLED=false` on shared OpenShift
deployments if you do not want browser shell access. When disabled, the tab shows
`podman exec` / `oc rsh` fallback commands.

Use the console text controls to decrease, reset, or increase the text size for
both Logs and Events / Debug output. Completed bootstrap runs show the returned
`RESULT` JSON first, followed by the human-readable ADO Bootstrap Recap.

## 📚 In-App Documentation

Use the question mark menu in the top-right of the UI to open:

- **ADO Collection Documentation**
- **ADO Preflight UI Documentation**

The ADO Collection Documentation page renders the collection `README.md`. Role
README links in the role documentation table can be clicked in the UI. For
example, clicking `roles/bootstrap_controller/README.md` opens the
`bootstrap_controller` role README inside the same documentation modal.

The role README loader only serves files matching `roles/<role>/README.md`
from known ADO collection locations in the running container or local checkout.

---

## ✅ Validation Checklist

After a successful run, validate:

- Git repo has generated files.
- Git branch is correct.
- Unselected components did not generate config directories.
- Vault files are encrypted when encryption is enabled.
- AAP organization exists.
- `ADO-inventory` or `<organization>-inventory` exists and contains only
  `localhost`.
- Component inventories exist when selected, such as
  `<organization>-RHEL-Inventory`, `<organization>-IDM-Inventory`, and
  `<organization>-Satellite-Server-Inventory`.
- AAP project points to the correct Git repo and branch.
- AAP credentials exist.
- AAP job templates are prefixed with the organization.
- AAP workflow templates are prefixed with the organization.
- Satellite inventory source exists if Satellite dynamic inventory was enabled.
- Demo/smoke test job ran if AAP smoke testing is enabled.

---

## 🧯 Troubleshooting

### UI Runs But AAP Fails

Check:

- AAP hostname URL
- Admin username/password or OAuth token
- Skip TLS checkbox
- AAP version
- Network path from container to AAP

### Git Push Fails

Check:

- Git URL
- Git branch
- Git token
- Repository permissions
- Whether the branch already exists

### Wrong Components Were Generated

Check:

- Top-level component selection
- Component app checkboxes
- Downloaded JSON `selected_component_apps`
- Downloaded JSON `component_config`

Only selected component configs should be sent.

### Vault Files Are Not Encrypted

Check:

- Vault encryption option
- Vault password value
- `generate_env_vars_encrypt_vault_files`
- `bootstrap_generate_env_vars_encrypt_vault_files`

### Self-Signed Certificate Errors

Enable skip TLS for the relevant system:

- AAP TLS skip checkbox for AAP
- OpenShift TLS skip checkbox for OpenShift
- Satellite validate certificate checkbox for Satellite

---

## 🧹 Operational Notes

- Re-running the UI against the same generated repo should clean stale generated component vars and vault files.
- AAP object names default from the organization name but can be edited.
- Job and workflow templates are generated only for selected components.
- RHEL and Satellite do not need storage values.
- OpenShift-style components can still use storage classes.
- The UI prefers the unified `infra.ado` collection when present.

---

## 🧾 Quick Example

Start from a downloadable preflight JSON (replace `CHANGE_ME` values, then
**Import** / paste into the UI or save as your working answers):

| Scenario | Download |
|----------|----------|
| RHEL + Satellite (steps below) | [examples/preflight-rhel-satellite.example.json](examples/preflight-rhel-satellite.example.json) |
| OpenShift + AAP / Grafana / ACS | [examples/preflight-openshift.example.json](examples/preflight-openshift.example.json) |

When the UI container is running, the same files are also at:

- `http://127.0.0.1:8080/examples/preflight-rhel-satellite.example.json`
- `http://127.0.0.1:8080/examples/preflight-openshift.example.json`

For a RHEL + Satellite environment by hand:

1. Set environment to `prod`.
2. Set domain to `prod.rhlab`.
3. Select `rhel`.
4. Under RHEL components, select `rhel` and `satellite`.
5. Fill in RHEL hostname if needed.
6. Fill in Satellite URL, organization, activation key, and service account.
7. Enable Satellite dynamic inventory if AAP should create a Satellite inventory source.
8. Configure Git URL and branch.
9. Configure AAP hostname, org, project, inventory, and vault password.
10. Add machine credential SSH key if patching or host registration requires it.
11. Run bootstrap.
12. Validate generated repo and AAP objects.

---

## 📌 Summary

ADO Pre-Flight UI is the guided front end for creating repeatable ADO bootstrap repositories. It collects answers, writes a preflight JSON, runs Ansible roles, generates selected component automation, and can configure AAP objects for the environment.

Use it when you want a consistent, repeatable way to move from preflight answers to generated automation without manually building the repo structure by hand.
