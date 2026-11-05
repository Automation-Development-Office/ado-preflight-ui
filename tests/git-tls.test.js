'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  gitHttpSslVerifyValue,
  gitCloneConfigArgs,
  buildProcessTlsEnv,
  ansibleTlsShellLines
} = require('../git-tls');
const {
  writeAdoGitCredentials,
  clearAdoGitCredentials,
  adoGitCredentialPaths
} = require('../git-username');

const TOKEN = 'glpat-regression-do-not-log';
const REPO = 'https://gitlab.example.test/group/bootstrap.git';

test('Git TLS and Controller TLS are independent', () => {
  const inherited = {
    GIT_SSL_NO_VERIFY: 'true',
    CONTROLLER_VERIFY_SSL: 'false',
    PYTHONHTTPSVERIFY: '0',
    REQUESTS_CA_BUNDLE: '/etc/pki/tls/certs/ca-bundle.crt'
  };
  const verify = buildProcessTlsEnv(inherited, { controllerSkipTls: false, gitSkipTls: false });
  assert.equal(verify.CONTROLLER_VERIFY_SSL, 'true');
  assert.equal(verify.TOWER_VERIFY_SSL, 'true');
  assert.equal(Object.hasOwn(verify, 'GIT_SSL_NO_VERIFY'), false);
  assert.equal(Object.hasOwn(verify, 'PYTHONHTTPSVERIFY'), false);
  assert.equal(verify.REQUESTS_CA_BUNDLE, inherited.REQUESTS_CA_BUNDLE);
  assert.equal(gitHttpSslVerifyValue(false), 'true');
  assert.deepEqual(gitCloneConfigArgs(false), ['-c', 'http.sslVerify=true']);

  const gitOnly = buildProcessTlsEnv(inherited, { controllerSkipTls: false, gitSkipTls: true });
  assert.equal(gitOnly.GIT_SSL_NO_VERIFY, 'true');
  assert.equal(gitOnly.CONTROLLER_VERIFY_SSL, 'true');
  assert.equal(Object.hasOwn(gitOnly, 'PYTHONHTTPSVERIFY'), false);
  assert.deepEqual(gitCloneConfigArgs(true), ['-c', 'http.sslVerify=false']);

  const both = buildProcessTlsEnv({}, { controllerSkipTls: true, gitSkipTls: true });
  assert.equal(both.CONTROLLER_VERIFY_SSL, 'false');
  assert.equal(both.PYTHONHTTPSVERIFY, '0');
  assert.equal(both.GIT_SSL_NO_VERIFY, 'true');
  const shell = ansibleTlsShellLines({ controllerSkipTls: false, gitSkipTls: false });
  assert.equal(shell.includes('PYTHONHTTPSVERIFY=0'), false);
  assert.match(shell, /CONTROLLER_VERIFY_SSL=true/);
  assert.match(shell, /unset GIT_SSL_NO_VERIFY/);
});

test('local git clone honors sslVerify without a network', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-git-tls-'));
  const origin = path.join(work, 'origin.git');
  const clone = path.join(work, 'clone');
  const git = (args, cwd) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  git(['init', '--bare', origin]);
  git(['clone', origin, clone]);
  git(['config', 'user.email', 'ado@example.test'], clone);
  git(['config', 'user.name', 'ADO'], clone);
  fs.writeFileSync(path.join(clone, 'README'), 'tls\n');
  git(['add', 'README'], clone);
  git(['commit', '-m', 'init'], clone);
  git(['push', 'origin', 'HEAD:main'], clone);
  const dest = path.join(work, 'dest');
  const args = [...gitCloneConfigArgs(false), 'clone', clone, dest];
  const cloned = spawnSync('git', args, { cwd: work, encoding: 'utf8' });
  assert.equal(cloned.status, 0, cloned.stderr);
  const verify = spawnSync('git', ['config', '--local', 'http.sslVerify', 'true'], {
    cwd: dest,
    encoding: 'utf8'
  });
  assert.equal(verify.status, 0, verify.stderr);
  const got = spawnSync('git', ['config', '--local', '--get', 'http.sslVerify'], {
    cwd: dest,
    encoding: 'utf8'
  });
  assert.equal(got.stdout.trim(), 'true');
  fs.rmSync(work, { recursive: true, force: true });
});

test('ADO credential file is mode 0600 and cleanup leaves other files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-git-cred-'));
  const decoy = path.join(home, '.git-credentials');
  fs.writeFileSync(decoy, 'https://other:secret@example.test\n', { mode: 0o600 });
  const written = writeAdoGitCredentials({
    repoUrl: REPO,
    token: TOKEN,
    username: 'saml-user',
    scmTool: 'gitlab',
    homeDir: home
  });
  assert.equal(written.kind, 'store');
  assert.equal(fs.statSync(written.path).mode & 0o777, 0o600);
  const body = fs.readFileSync(written.path, 'utf8');
  assert.match(body, /^https:\/\/saml-user:/);
  assert.equal(body.includes('@gitlab.example.test'), true);
  const paths = adoGitCredentialPaths(home);
  assert.equal(paths.credentials.endsWith('.ado-git-credentials'), true);
  assert.equal(decoy.includes('.ado-git-credentials'), false);
  const removed = clearAdoGitCredentials(home);
  assert.equal(removed.length, 1);
  assert.equal(fs.existsSync(decoy), true);
  assert.equal(fs.existsSync(written.path), false);
  fs.rmSync(home, { recursive: true, force: true });
});
