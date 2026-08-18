FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src
COPY package.json index.html README.md ./
COPY ado-logo-redhat.png ./
COPY src ./src
RUN npm install && npm run build

# Runtime image: skopeo pushes a *baked-in* ADO EE archive to Hub (no host podman, no runtime internet).
FROM registry.access.redhat.com/ubi9/nodejs-20

USER 0

RUN dnf install -y git python3 python3-pip skopeo && \
    pip3 install ansible-core kubernetes jsonpatch requests-oauthlib && \
    dnf clean all

WORKDIR /opt/app-root/src

COPY package.json README.md ./
RUN npm install --omit=dev

COPY server.js ./
COPY --from=build /opt/app-root/src/dist ./dist
COPY examples ./examples

COPY collections/ /opt/ado-collections/

# Disconnected Hub EE source (prepared by restart_pod.sh / scripts/prepare-ado-ee-archive.sh).
# Optional at COPY time so CI can inject the archive as a build secret/context file.
COPY vendor/ado-ee.docker.tar /opt/ado-ee/ado-ee.docker.tar

# Overlay Hub EE push + hub-only org/Galaxy create tasks onto collection tarball + keep for runtime re-overlay.
COPY docker/push_hub_ee.yml /opt/ado-ee/push_hub_ee.yml
COPY docker/apply_aap_25_plus.yml /opt/ado-ee/apply_aap_25_plus.yml
COPY docker/apply_galaxy_hub_credentials.yml /opt/ado-ee/apply_galaxy_hub_credentials.yml
COPY docker/skip_existing_execution_environments.yml /opt/ado-ee/skip_existing_execution_environments.yml

RUN set -eux; \
    mkdir -p /workspace /opt/ado-collections/extracted /opt/ado-ee; \
    ado_archive="$(find /opt/ado-collections -maxdepth 1 -name 'infra-ado-*.tar.gz' | sort | tail -n 1)"; \
    if [ -n "$ado_archive" ]; then \
      tar -xzf "$ado_archive" -C /opt/ado-collections/extracted README.md roles docs || true; \
    fi; \
    find /opt/ado-collections -type f -name 'push_hub_ee.yml' -exec cp -f /opt/ado-ee/push_hub_ee.yml {} \;; \
    find /opt/ado-collections -type f -name 'apply_aap_25_plus.yml' -exec cp -f /opt/ado-ee/apply_aap_25_plus.yml {} \;; \
    find /opt/ado-collections -type f -name 'apply_galaxy_hub_credentials.yml' -exec cp -f /opt/ado-ee/apply_galaxy_hub_credentials.yml {} \;; \
    find /opt/ado-collections -type d -path '*/bootstrap_controller/tasks' -exec cp -f /opt/ado-ee/skip_existing_execution_environments.yml {}/skip_existing_execution_environments.yml \;; \
    test -s /opt/ado-ee/ado-ee.docker.tar; \
    test -s /opt/ado-ee/push_hub_ee.yml; \
    test -s /opt/ado-ee/apply_aap_25_plus.yml; \
    test -s /opt/ado-ee/apply_galaxy_hub_credentials.yml; \
    test -s /opt/ado-ee/skip_existing_execution_environments.yml; \
    chown -R 1001:0 /workspace /opt/app-root/src /opt/ado-collections /opt/ado-ee; \
    chmod -R g+rwX /workspace /opt/app-root/src /opt/ado-collections /opt/ado-ee

USER 1001

EXPOSE 8080

ENV ADO_EE_DOCKER_ARCHIVE=/opt/ado-ee/ado-ee.docker.tar

CMD ["node", "server.js"]
