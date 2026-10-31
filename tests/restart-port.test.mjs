import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'restart_pod.sh');

test('restart script does not kill unrelated port owners', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.equal(text.includes('fuser'), false);
  assert.equal(text.includes('publish='), false);
  assert.match(text, /BIND_ADDR="\$\{BIND_ADDR:-}"/);
  assert.match(text, /-p "\$\(publish_spec\)"/);
  assert.match(text, /podman rm -f "\$\{NAME\}"/);
  assert.match(text, /Image build failed\. Left the/);
  assert.match(text, /podman logs "\$\{NAME\}"/);
  const mainBody = text.slice(text.indexOf('main() {'));
  const buildAt = mainBody.indexOf('podman build');
  const stopAt = mainBody.indexOf('stop_named_container');
  assert.ok(buildAt > 0 && stopAt > buildAt);
});

test('publish address stays on all interfaces unless BIND_ADDR is set', () => {
  const result = spawnSync('bash', ['-lc', `
    set -euo pipefail
    source ${JSON.stringify(script)}
    PORT=8080
    BIND_ADDR=
    test "$(publish_spec)" = "8080:8080"
    test "$(probe_url)" = "http://127.0.0.1:8080/"
    BIND_ADDR=127.0.0.1
    test "$(publish_spec)" = "127.0.0.1:8080:8080"
    test "$(probe_url)" = "http://127.0.0.1:8080/"
    BIND_ADDR=192.0.2.10
    test "$(publish_spec)" = "192.0.2.10:8080:8080"
    test "$(probe_url)" = "http://192.0.2.10:8080/"
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('a busy port is reported and the other process keeps running', async () => {
  const port = 18771;
  const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    stdio: 'ignore'
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    const result = spawnSync('bash', ['-lc', `
      set -euo pipefail
      source ${JSON.stringify(script)}
      PORT=${port}
      NAME=ado-preflight-ui-test
      if assert_port_free "${port}"; then
        echo unexpectedly-free
        exit 2
      fi
      echo refused
    `], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /already in use/);
    assert.equal(result.stdout.includes('refused'), true);
    const still = spawnSync('ps', ['-p', String(child.pid), '-o', 'pid=']);
    assert.equal(still.status, 0);
  } finally {
    child.kill('SIGTERM');
  }
});
