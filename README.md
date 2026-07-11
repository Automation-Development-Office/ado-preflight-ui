# ADO Pre-Flight UI

🧭 **A guided web UI for generating ADO bootstrap automation for Ansible Automation Platform, RHEL, Satellite, OpenShift, and related platform components.**

The ADO Pre-Flight UI is a containerized questionnaire that turns a set of environment answers into a working bootstrap repository. It can generate environment variable files, vault files, playbooks, controller configuration, AAP credentials, inventories, projects, job templates, workflow templates, and optional Git commits.

This README assumes you have never used ADO or this UI before.

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
- Optional machine credential configuration

RHEL no longer asks for storage. Storage is only relevant to OpenShift-style components.

### Satellite

Satellite configuration includes:

- Satellite hostname or URL
- Satellite organization
- Activation key
- Service account username
- Service account password
- Admin password
- TLS validation choice
- Dynamic inventory settings

Satellite no longer asks for storage.

If dynamic inventory is enabled, the generated AAP controller config includes a Satellite 6 inventory source.

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

OpenShift configuration includes:

- OpenShift API host
- OpenShift apps domain
- OpenShift API token
- Skip TLS certificate verification

The OpenShift skip TLS option defaults to enabled for self-signed environments.

### Grafana

Grafana configuration includes:

- Hostname / URL
- Storage class
- Folder name
- Dashboard source folder or Git repository

### IDM

IDM configuration includes:

- Hostname
- Storage
- Domain
- Realm
- Admin password
- Directory Manager password

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

Fields include:

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

---

## ▶️ Running Bootstrap

Use the action menu to run bootstrap after the form is complete.

The UI sends the selected-only preflight JSON to the backend. The backend writes that JSON into the container workspace and runs Ansible.

During the run, the UI shows:

- Ansible logs
- Event stream
- Exit status
- Generated output messages

If the run fails, check:

- AAP URL and credentials
- TLS verification setting
- Git URL, branch, and token
- Vault password
- Selected component values
- Network access from the container

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
│   ├── rhel/
│   └── satellite/
└── configs/
    ├── controller/
    ├── job_templates/
    └── workflows/
```

The exact directories depend on selected components.

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

---

## ✅ Validation Checklist

After a successful run, validate:

- Git repo has generated files.
- Git branch is correct.
- Unselected components did not generate config directories.
- Vault files are encrypted when encryption is enabled.
- AAP organization exists.
- AAP inventory exists.
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

For a RHEL + Satellite environment:

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
