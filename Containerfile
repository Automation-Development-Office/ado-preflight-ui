FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src
COPY package.json index.html README.md ./
COPY ado-logo-redhat.png ./
COPY src ./src
RUN npm install && npm run build

FROM registry.access.redhat.com/ubi9/nodejs-20

USER 0

RUN dnf install -y git python3 python3-pip && \
    pip3 install ansible-core && \
    dnf clean all

WORKDIR /opt/app-root/src

COPY package.json README.md ./
RUN npm install --omit=dev

COPY server.js ./
COPY --from=build /opt/app-root/src/dist ./dist

COPY collections/ /opt/ado-collections/

RUN set -eux; \
    mkdir -p /workspace /opt/ado-collections/extracted; \
    ado_archive="$(find /opt/ado-collections -maxdepth 1 -name 'infra-ado-*.tar.gz' | sort | tail -n 1)"; \
    if [ -n "$ado_archive" ]; then \
      tar -xzf "$ado_archive" -C /opt/ado-collections/extracted README.md || true; \
    fi; \
    chown -R 1001:0 /workspace /opt/app-root/src /opt/ado-collections; \
    chmod -R g+rwX /workspace /opt/app-root/src /opt/ado-collections

USER 1001

EXPOSE 8080

CMD ["node", "server.js"]
