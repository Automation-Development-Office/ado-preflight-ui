# ADO Pre-Flight UI

Component-Based Bootstrap Automation for Red Hat Ansible Automation Platform

---

# Overview

ADO Pre-Flight UI provides a graphical interface for generating and deploying ADO Bootstrap Framework automation.

The application runs entirely inside a local Podman container and allows consultants, architects, and customers to:

* Generate playbooks
* Generate inventories
* Generate environment variables
* Generate vault files
* Generate AAP configuration
* Generate job templates
* Generate workflows
* Push generated content into Git
* Deploy configuration into Ansible Automation Platform

without manually editing YAML files.

---

# Features

## Component-Based Bootstrap Model

Generate automation for:

* OpenShift
* RHEL
* Patching
* Grafana
* RHBK
* Satellite
* IDM
* Kafka
* GitLab
* Elastic
* PEGA
* AAP

or generate everything using:

```text
all
```

---

## AAP Integration

Automatically:

* Create Organizations
* Create Inventories
* Create Credentials
* Create Execution Environments
* Create Projects
* Create Job Templates
* Create Workflow Templates

inside Ansible Automation Platform.

---

## Git Integration

Supports:

* GitLab
* GitHub
* Bitbucket
* Other Git repositories

Can optionally:

* Commit generated files
* Push generated files automatically

---

## Live Bootstrap Console

Provides:

* Real-time Ansible output
* Colored status messages
* Error highlighting
* Events stream
* Downloadable logs
* Raw output viewer

---

## Theme Support

Supports:

* Light Theme
* Dark Theme

---

# Requirements

## Podman

Install Podman:

Fedora

```bash
sudo dnf install -y podman
```

RHEL

```bash
sudo dnf install -y podman
```

---

# Download and Run

Pull the latest image:

```bash
podman pull ghcr.io/automation-development-office/ado-preflight-ui:latest
```

Start the UI:

```bash
podman run --rm -d \
  --name ado-preflight-ui \
  -p 8080:8080 \
  ghcr.io/automation-development-office/ado-preflight-ui:latest
```

Verify:

```bash
podman ps
```

View logs:

```bash
podman logs -f ado-preflight-ui
```

---

# Open the UI

Browse to:

```text
http://127.0.0.1:8080
```

---

# Workflow

The standard workflow consists of:

1. Configure Environment
2. Select Components
3. Configure Component Variables
4. Configure Git
5. Configure AAP
6. Run Bootstrap
7. Review Output
8. Validate Results

---

# Step 1 - Configure Environment

Populate:

## Environment Type

Example:

```text
prod
```

## Base Infrastructure Domain

Example:

```text
prod.rhlab
```

The base domain is used to derive:

```text
apps.prod.rhlab
api.prod.rhlab
grafana.prod.rhlab
```

and other generated variables.

---

# Step 2 - Select Components

Choose the desired bootstrap components.

Example:

```text
OpenShift
```

Expanding OpenShift exposes selectable applications:

```text
AAP
ACS
ACM
Cert Manager
Console
DevSpaces
Directory Server
ECK
GitOps
GitLab
Grafana
Kafka
OADP
OpenShift
PEGA
Quay
RHBK
```

Only selected applications are generated.

---

# Step 3 - Configure Component Variables

Clicking a component name opens its configuration panel.

Example:

```text
openshift
```

opens:

```text
OpenShift Configuration
```

with:

```text
OpenShift API Host
OpenShift Apps Domain
OpenShift API Token
```

---

## Grafana Variables

Selecting Grafana displays:

```text
Hostname
Storage
Folder Name
Dashboard Repository
```

---

## RHBK Variables

Selecting RHBK displays:

```text
Hostname
Storage
Realm
Client
```

---

## Satellite Variables

Selecting Satellite displays:

```text
Hostname
Organization
Activation Key
```

---

## IDM Variables

Selecting IDM displays:

```text
Hostname
Domain
Realm
Admin Password
Directory Manager Password
```

Sensitive fields support:

```text
Show
Hide
```

buttons.

---

# Step 4 - Configure Git

Populate:

## Source Repository

Example:

```text
https://gitlab-git.apps.ocp.prod.rhlab/redhat-lab/bootstrap-sample.git
```

## Branch

Example:

```text
main
```

## Token

Provide:

```text
GitLab Access Token
GitHub PAT
Bitbucket Token
```

depending on SCM.

---

## Auto Commit and Push

Enable:

```text
Automatically commit and push generated content to Git
```

Recommended:

```text
Enabled
```

When enabled:

```text
git add .
git commit
git push
```

are executed automatically.

---

# Step 5 - Configure AAP

If deploying to Automation Platform:

Select:

```text
Using AAP
```

Populate:

## Hostname

Example:

```text
https://aap-aap.apps.ocp.prod.rhlab
```

## Version

Example:

```text
2.6
```

## Organization

Example:

```text
ado-lab
```

## Inventory

Example:

```text
ado-inventory
```

## Project

Example:

```text
ado-project
```

## Execution Environment

Example:

```text
ee-supported-rhel9
```

## OAuth Token

Used for API access.

## Vault Credential

Example:

```text
ado-vault
```

---

# Step 6 - Run Bootstrap

Press:

```text
Run Bootstrap
```

The UI performs:

1. Install collections
2. Clone repository
3. Generate vars
4. Generate vault files
5. Generate playbooks
6. Generate AAP configs
7. Commit changes
8. Push changes
9. Apply AAP configuration

---

# Bootstrap Console

The console displays live execution.

Information shown includes:

```text
Collection installation
Git operations
Ansible execution
AAP deployment
Errors
Warnings
Status
```

---

# Events Tab

The Events tab provides:

```text
Bootstrap Started
Selected Components
Selected Apps
Git Operations
Collection Install Status
Playbook Execution
Completion Status
```

This view is useful for troubleshooting and audit purposes.

---

# Verbosity

Choose verbosity before running:

```text
Normal
Verbose
Debug
```

Higher verbosity provides additional Ansible output.

---

# Actions Menu

The Actions menu provides additional tools.

Examples:

```text
Raw Output
Download Log
```

---

## Raw Output

Displays the complete unfiltered Ansible log.

Useful for:

* Support
* Troubleshooting
* Development

---

## Download Log

Downloads the complete bootstrap log.

Useful when opening:

* GitHub Issues
* GitLab Issues
* Support Cases

---

# Theme Selection

Use the Settings menu to switch between:

```text
Light
Dark
```

The selected theme is applied immediately.

---

# Documentation Menu

Available from:

```text
?
```

menu.

Provides:

```text
Documentation
```

for usage instructions and reference material.

---

# Show Collections

Available from:

```text
?
```

menu.

Displays:

## Installed ADO Collections

Example:

```text
ado-bootstrap
ado-openshift
ado-applications
ado-platform
ado-utilities
```

with installed versions.

---

## Installed Dependencies

Example:

```text
ansible.controller
infra.aap_configuration
infra.controller_configuration
```

---

## Local Tools

Displays local runtime dependencies:

```text
ansible-core
ansible-navigator
git
podman
python
oc
```

---

# Generated Artifacts

The bootstrap framework generates:

```text
playbooks/
configs/
group_vars/
```

and supporting AAP configuration.

---

# Troubleshooting

## View Container Logs

```bash
podman logs -f ado-preflight-ui
```

---

## Restart Container

```bash
podman rm -f ado-preflight-ui

podman run --rm -d \
  --name ado-preflight-ui \
  -p 8080:8080 \
  ghcr.io/automation-development-office/ado-preflight-ui:latest
```

---

## Verify Container Running

```bash
podman ps
```

---

# Project Information

Organization:

```text
Automation Development Office
```

Container:

```text
ghcr.io/automation-development-office/ado-preflight-ui
```

Primary Purpose:

```text
Generate and deploy component-based bootstrap automation
for Ansible Automation Platform, OpenShift, and Red Hat
infrastructure environments.
```

