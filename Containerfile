FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src
COPY package.json index.html README.md known-bugs.md ./
COPY ado-logo-redhat.png ./
# Bust frontend cache whenever src/ changes (same trap as collections tarball).
ARG ADO_UI_SHA=unknown
RUN printf '%s\n' "${ADO_UI_SHA}" > /tmp/ado-ui.sha
COPY src ./src
COPY public ./public
RUN npm install && npm run build

# Runtime image: skopeo pushes a *baked-in* ADO EE archive to Hub (no host podman, no runtime internet).
# Contoller bootstrap logic lives in the infra-ado collection tarball — do not overlay
# bootstrap_controller tasks here. Only patch infra.aap_configuration for AAP 2.7 async.
FROM registry.access.redhat.com/ubi9/nodejs-20

USER 0

RUN dnf install -y git python3 python3-pip skopeo gcc-c++ make python3-devel tar && \
    curl -fsSL https://mirror.openshift.com/pub/openshift-v4/x86_64/clients/ocp/stable/openshift-client-linux.tar.gz \
      | tar -xz -C /usr/local/bin oc kubectl && \
    curl -fsSL -o /usr/local/bin/helm \
      https://mirror.openshift.com/pub/openshift-v4/clients/helm/latest/helm-linux-amd64 && \
    chmod 0755 /usr/local/bin/helm && \
    helm version --short && \
    pip3 install ansible-core kubernetes jsonpatch requests-oauthlib && \
    dnf clean all

WORKDIR /opt/app-root/src

COPY package.json README.md known-bugs.md ./
RUN npm install --omit=dev

COPY server.js ./
COPY scripts/build-assistant-knowledge.py ./scripts/
COPY docker/README.md ./docker/README.md
COPY .changeset/README.md ./.changeset/README.md
COPY deploy ./deploy
COPY --from=build /opt/app-root/src/dist ./dist
COPY examples ./examples

# Bust layer cache whenever baked infra-ado (or sibling) tarballs change. Same
# filename + podman cache previously kept shipping a stale collection after
# collections/infra-ado-*.tar.gz was replaced on the host.
ARG ADO_COLLECTIONS_SHA=unknown
RUN mkdir -p /opt/ado-collections && printf '%s\n' "${ADO_COLLECTIONS_SHA}" > /opt/ado-collections/.ado-collections.sha
COPY collections/ /opt/ado-collections/

# Disconnected Hub EE source (prepared by restart_pod.sh / scripts/prepare-ado-ee-archive.sh).
COPY vendor/ado-ee.docker.tar /opt/ado-ee/ado-ee.docker.tar

# Only non-ado overlays: ansible.platform 2.7 rejects async on gateway authenticator roles.
COPY docker/gateway_authenticators_main.yml /opt/ado-ee/gateway_authenticators_main.yml
COPY docker/gateway_authenticator_maps_main.yml /opt/ado-ee/gateway_authenticator_maps_main.yml

RUN set -eux; \
    mkdir -p /workspace /opt/ado-collections/extracted /opt/ado-ee; \
    ado_archive="$(find /opt/ado-collections -maxdepth 1 -name 'infra-ado-*.tar.gz' | sort -V | tail -n 1)"; \
    if [ -n "$ado_archive" ]; then \
      tar -xzf "$ado_archive" -C /opt/ado-collections/extracted \
        roles docs meta plugins README.md 2>/dev/null \
        || tar -xzf "$ado_archive" -C /opt/ado-collections/extracted; \
    fi; \
    ADO_ASSISTANT_COLLECTIONS=/opt/ado-collections python3 scripts/build-assistant-knowledge.py; \
    cp public/assistant-knowledge.json dist/assistant-knowledge.json; \
    test -s /opt/ado-ee/ado-ee.docker.tar; \
    test -s /opt/ado-ee/gateway_authenticators_main.yml; \
    test -s /opt/ado-ee/gateway_authenticator_maps_main.yml; \
    chown -R 1001:0 /workspace /opt/app-root/src /opt/ado-collections /opt/ado-ee; \
    chmod -R g+rwX /workspace /opt/app-root/src /opt/ado-collections /opt/ado-ee

USER 1001

EXPOSE 8080

ENV ADO_EE_DOCKER_ARCHIVE=/opt/ado-ee/ado-ee.docker.tar

CMD ["node", "server.js"]
