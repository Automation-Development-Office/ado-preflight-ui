# ADO Preflight UI Changelog

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
- Added machine credential SSH key inputs for RHEL, Satellite, and patching workflows.
- Added Satellite service account fields for Satellite configuration.
- Added Satellite dynamic inventory configuration fields for AAP inventory sources.
- Added RHEL patching survey inputs for reboot behavior, package list, package state, exclusions, disabled repositories, cache refresh, kernel cleanup, and skip-broken handling.
- Added RHBK configuration tabs for selected resources such as client, IDP, group mapper, client scopes, and federation.
- Added UI version, image, tag, pod, and Node runtime details to the collections dialog.
- Added ADO Collection Documentation and ADO Preflight UI Documentation entries under the help menu.
- Added markdown rendering for in-app documentation.
- Added JSON import in Core Environment Information so saved preflight payloads can repopulate the UI.

### Changed

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

### Fixed

- Documentation modals no longer display raw JSON error bodies when a README is missing.
- Documentation endpoints now return readable markdown fallback text and log missing container paths to the server events.
- Documentation fetches now fail cleanly if a route returns a non-success response.

## 1.0.0 - 2026-07-10

### Added

- Added initial component configuration support for selected bootstrap components.
- Added UI support for Git branch, Git token, automatic commit and push, and bootstrap execution options.
- Added collection and local Ansible tool visibility in the collections dialog.
- Added support for passing UI selections into the same bootstrap roles used by CLI runs.

### Changed

- Standardized bootstrap generation around the unified `infra.ado` collection when present.
- Improved component option handling so UI-generated runs align with CLI bootstrap variables.
