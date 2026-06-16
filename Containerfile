FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src
COPY package.json index.html ./
COPY ado-logo-redhat.png ./
COPY src ./src
RUN npm install && npm run build

FROM registry.access.redhat.com/ubi9/nodejs-20

USER 0

RUN dnf install -y git python3 python3-pip && \
    pip3 install ansible-core && \
    dnf clean all

WORKDIR /opt/app-root/src

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY --from=build /opt/app-root/src/dist ./dist

RUN mkdir -p /workspace /opt/ado-collections && \
    chown -R 1001:0 /workspace /opt/app-root/src /opt/ado-collections && \
    chmod -R g+rwX /workspace /opt/app-root/src /opt/ado-collections

COPY collections/ /opt/ado-collections/

USER 1001

EXPOSE 8080

CMD ["node", "server.js"]
