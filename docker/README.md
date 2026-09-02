# Preflight UI overlays (non-ado only)

Bootstrap Contoller logic ships in the `infra-ado-*.tar.gz` under `collections/`.
Do **not** add `bootstrap_controller` task forks here.

Kept here only because they patch **infra.aap_configuration** (AAP 2.7 rejects
async on gateway authenticator roles):

- `gateway_authenticators_main.yml`
- `gateway_authenticator_maps_main.yml`

Hub EE disconnected push uses the collection's `push_hub_ee.yml` plus the baked
archive at `/opt/ado-ee/ado-ee.docker.tar` (`ADO_EE_DOCKER_ARCHIVE`).
