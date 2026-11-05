FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src
COPY package.json index.html README.md known-bugs.md ./
COPY ado-logo-redhat.png ./
COPY public ./public
# App.jsx imports ../git-tls.js. In this stage the project root is
# /opt/app-root/src, and src/ is copied underneath it, so the file must
# sit next to package.json for that relative import to resolve.
COPY git-tls.js ./git-tls.js
COPY src ./src
# npm 10.8.2 in this image crashes on peer resolution (edgesOut). npm 11 does not.
# hash -r drops the shell's cached /usr/bin/npm from the line above.
RUN npm install -g npm@11 && hash -r && npm install && npm run build

# Runtime image: skopeo pushes a *baked-in* ADO EE archive to Hub (no host podman, no runtime internet).
# Contoller bootstrap logic lives in the infra-automation_development_office collection tarball — do not overlay
# bootstrap_controller tasks here. Only patch infra.aap_configuration for AAP 2.7 async.
FROM registry.access.redhat.com/ubi9/nodejs-20

USER 0

# sshpass: password SSH from the pod to standalone RHEL AAP install hosts
# (ansible.builtin + aap_setup_* with aap_setup_ssh_password).
RUN dnf install -y git python3 python3-pip skopeo gcc-c++ make python3-devel tar sshpass && \
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
COPY docs ./docs
COPY scripts/build-assistant-knowledge.py ./scripts/build-assistant-knowledge.py
COPY public/assistant-knowledge.json ./public/assistant-knowledge.json
RUN npm install -g npm@11 && hash -r && npm install --omit=dev

COPY server.js ./
COPY git-username.js git-tls.js collection-archive.js doc-paths.js ./
COPY scripts/check-server-modules.js ./scripts/check-server-modules.js
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
    node scripts/check-server-modules.js; \
    mkdir -p /workspace /opt/ado-collections/extracted /opt/ado-ee; \
    ado_archive="$(find /opt/ado-collections -maxdepth 1 -name 'infra-automation_development_office-*.tar.gz' | sort -V | tail -n 1)"; \
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
