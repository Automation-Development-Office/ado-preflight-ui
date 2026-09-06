const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');
const { app, validateAgentInstaller } = require('../server');

let server;
let baseUrl;

before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

test('GET /api/ui-version returns package version', async () => {
  const response = await fetch(`${baseUrl}/api/ui-version`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.version, packageJson.version);
  assert.match(body.nodeVersion, /^v\d+/);
});

test('GET /api/readme/ui returns markdown documentation', async () => {
  const response = await fetch(`${baseUrl}/api/readme/ui`);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /ADO Preflight UI/i);
});

test('GET /api/terminal/status returns availability JSON', async () => {
  const response = await fetch(`${baseUrl}/api/terminal/status`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.available, 'boolean');
});

test('GET /api/events responds for live log stream', async () => {
  const response = await fetch(`${baseUrl}/api/events`);
  assert.equal(response.status, 200);
});

test('POST /api/openshift-agent/validate rejects empty payload', async () => {
  const response = await fetch(`${baseUrl}/api/openshift-agent/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.valid, false);
  assert.ok(body.errors.length > 0);
});

test('validateAgentInstaller accepts a minimal SNO profile', () => {
  const result = validateAgentInstaller({
    topology: 'sno',
    cluster_name: 'ci-cluster',
    base_domain: 'example.lab',
    machine_network_cidr: '192.168.1.0/24',
    cluster_network_cidr: '10.128.0.0/14',
    service_network_cidr: '172.30.0.0/16',
    api_vip: '192.168.1.10',
    ingress_vip: '192.168.1.11',
    rendezvous_ip: '192.168.1.20',
    pull_secret: '{"auths":{}}',
    ssh_public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyForTests example@ci',
    nodes: [
      {
        role: 'master',
        hostname: 'master-0',
        macAddress: '11:22:33:44:55:66',
        interfaceName: 'ens3f0',
        networkMode: 'dhcp'
      }
    ]
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});
