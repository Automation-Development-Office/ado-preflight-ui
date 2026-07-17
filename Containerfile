FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src
COPY package.json index.html README.md ./
COPY ado-logo-redhat.png ./
COPY src ./src
RUN npm install && npm run build

FROM registry.access.redhat.com/ubi9/nodejs-20

USER 0

RUN set -eux; \
    dnf install -y git python3 curl ca-certificates; \
    dnf install -y python3-pip || true; \
    if ! python3 -m pip --version >/dev/null 2>&1; then \
      python3 -m ensurepip --upgrade || true; \
    fi; \
    if ! python3 -m pip --version >/dev/null 2>&1; then \
      curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py; \
      python3 /tmp/get-pip.py; \
      rm -f /tmp/get-pip.py; \
    fi; \
    PIP_BREAK_SYSTEM_PACKAGES=1 python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel; \
    PIP_BREAK_SYSTEM_PACKAGES=1 python3 -m pip install --no-cache-dir ansible-core; \
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
      tar -xzf "$ado_archive" -C /opt/ado-collections/extracted README.md roles docs || true; \
    fi; \
    chown -R 1001:0 /workspace /opt/app-root/src /opt/ado-collections; \
    chmod -R g+rwX /workspace /opt/app-root/src /opt/ado-collections

USER 1001

EXPOSE 8080

CMD ["node", "server.js"]
