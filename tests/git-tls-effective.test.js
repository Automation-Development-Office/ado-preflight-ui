'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  resolveGitSkipTls,
  applyImportedGitSkipTls,
  gitTlsStage,
  gitCloneConfigArgs,
  buildProcessTlsEnv
} = require('../git-tls');
const {
  resolveGitUsername,
  cleanGitRemoteUrl,
  writeAdoGitCredentials,
  redactSecretsForLog
} = require('../git-username');

const TOKEN = 'glpat-regression-do-not-log';
const ROOT = path.resolve(__dirname, '..');

function stageRow(raw, { omittedSkips }) {
  const normalized = resolveGitSkipTls(raw, { omittedSkips });
  const ui = gitTlsStage(normalized);
  const saved = ui.skipTlsVerify;
  const reimported = applyImportedGitSkipTls({ skip_tls_verify: false }, {
    skip_tls_verify: saved
  }).skip_tls_verify;
  return {
    normalized,
    checkboxChecked: ui.checkboxChecked,
    label: ui.label,
    saved,
    reimported,
    cloneArgs: gitCloneConfigArgs(reimported),
    sslVerify: ui.sslVerify
  };
}

test('Git TLS stages agree from import through the git command', () => {
  const fresh = stageRow(false, { omittedSkips: false });
  assert.equal(fresh.checkboxChecked, false);
  assert.equal(fresh.sslVerify, 'true');
  assert.match(fresh.label, /verification enabled/);
  assert.deepEqual(fresh.cloneArgs, ['-c', 'http.sslVerify=true']);

  const explicitSkip = stageRow(true, { omittedSkips: true });
  assert.equal(explicitSkip.checkboxChecked, true);
  assert.equal(explicitSkip.sslVerify, 'false');
  assert.deepEqual(explicitSkip.cloneArgs, ['-c', 'http.sslVerify=false']);
  assert.equal(explicitSkip.reimported, true);

  const explicitVerify = stageRow(false, { omittedSkips: true });
  assert.equal(explicitVerify.checkboxChecked, false);
  assert.equal(explicitVerify.sslVerify, 'true');
  assert.equal(explicitVerify.reimported, false);

  const legacy = applyImportedGitSkipTls(
    { skip_tls_verify: false, token: '' },
    { token: '' }
  );
  const legacyUi = gitTlsStage(legacy.skip_tls_verify);
  assert.equal(legacy.skip_tls_verify, true);
  assert.equal(legacyUi.checkboxChecked, true);
  assert.match(legacyUi.label, /verification disabled/);

  const unchecked = { ...legacy, skip_tls_verify: false };
  const saved = { skip_tls_verify: gitTlsStage(unchecked.skip_tls_verify).skipTlsVerify };
  const again = applyImportedGitSkipTls({ skip_tls_verify: false }, saved);
  assert.equal(saved.skip_tls_verify, false);
  assert.equal(again.skip_tls_verify, false);
  assert.equal(gitTlsStage(again.skip_tls_verify).checkboxChecked, false);
  assert.deepEqual(gitCloneConfigArgs(again.skip_tls_verify), ['-c', 'http.sslVerify=true']);
});

test('server and form use the same Git TLS decision', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
  assert.match(server, /resolveGitSkipTls\(data\.git\.skip_tls_verify, \{ omittedSkips: true \}\)/);
  assert.match(server, /data\?\.git\?\.skip_tls_verify === true/);
  assert.match(server, /gitCloneConfigArgs\(gitSkipTlsVerify\)/);
  assert.match(server, /\['config', '--local', 'http\.sslVerify', gitHttpSslVerifyValue\(gitSkipTlsVerify\)\]/);
  assert.match(server, /git -c http\.sslVerify=\$\{gitHttpSslVerifyValue\(gitSkipTlsVerify\)\} push/);
  assert.match(app, /applyImportedGitSkipTls\(merged\.git, normalizedInput\.git\)/);
  assert.match(app, /id="git-tls-effective"/);
  assert.match(app, /gitTlsStage\(data\.git\?\.skip_tls_verify\)\.checkboxChecked/);
  assert.match(app, /payload\.git\.skip_tls_verify = gitTlsStage\(payload\.git\.skip_tls_verify\)\.skipTlsVerify/);
  assert.equal(app.includes('data.git.skip_tls_verify !== false'), false);
  assert.equal(app.includes('data?.git?.skip_tls_verify !== false'), false);
});

test('username and token stay independent of Git TLS and out of the remote URL', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-git-tls-auth-'));
  try {
    for (const skip of [false, true]) {
      const written = writeAdoGitCredentials({
        repoUrl: 'https://gitlab.example.test/group/bootstrap.git',
        token: TOKEN,
        username: 'saml-user',
        scmTool: 'gitlab',
        homeDir: home
      });
      const body = fs.readFileSync(written.path, 'utf8');
      assert.match(body, /^https:\/\/saml-user:/);
      assert.equal(resolveGitUsername('gitlab', 'saml-user'), 'saml-user');
      assert.equal(resolveGitUsername('gitlab', ''), 'oauth2');
      const remote = cleanGitRemoteUrl(`https://saml-user:${TOKEN}@gitlab.example.test/group/bootstrap.git`);
      assert.equal(remote.includes(TOKEN), false);
      assert.equal(remote.includes('saml-user'), false);
      const logged = redactSecretsForLog(
        `git ${gitCloneConfigArgs(skip).join(' ')} clone ${remote} (skip=${skip})`
      );
      assert.equal(logged.includes(TOKEN), false);
      assert.equal(gitTlsStage(skip).sslVerify, skip ? 'false' : 'true');
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

function gitEnv(work, extra = {}) {
  const env = {
    ...process.env,
    HOME: work,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'ADO',
    GIT_AUTHOR_EMAIL: 'ado@example.test',
    GIT_COMMITTER_NAME: 'ADO',
    GIT_COMMITTER_EMAIL: 'ado@example.test',
    ...extra
  };
  delete env.GIT_SSL_NO_VERIFY;
  for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) {
    delete env[key];
  }
  env.NO_PROXY = '127.0.0.1,localhost';
  env.no_proxy = env.NO_PROXY;
  return env;
}

function git(args, cwd, env) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function localSsl(repo) {
  return spawnSync('git', ['config', '--local', '--get', 'http.sslVerify'], {
    cwd: repo,
    encoding: 'utf8'
  }).stdout.trim();
}

test('clone, fetch, pull, and push drop a stale http.sslVerify=false', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-git-tls-ops-'));
  const env = gitEnv(work);
  try {
    const origin = path.join(work, 'origin.git');
    const seed = path.join(work, 'seed');
    git(['init', '--bare', '-b', 'main', origin], work, env);
    git(['clone', origin, seed], work, env);
    git(['config', 'user.email', 'ado@example.test'], seed, env);
    git(['config', 'user.name', 'ADO'], seed, env);
    fs.writeFileSync(path.join(seed, 'README'), 'one\n');
    git(['add', 'README'], seed, env);
    git(['commit', '-m', 'one'], seed, env);
    git(['push', 'origin', 'HEAD:main'], seed, env);

    const clone = path.join(work, 'clone');
    const cloneArgs = [...gitCloneConfigArgs(false), 'clone', origin, clone];
    git(cloneArgs, work, env);
    git(['config', '--local', 'http.sslVerify', 'false'], clone, env);
    assert.equal(localSsl(clone), 'false');

    git(['config', '--local', 'http.sslVerify', gitTlsStage(false).sslVerify], clone, env);
    assert.equal(localSsl(clone), 'true');
    git([...gitCloneConfigArgs(false), 'fetch', 'origin'], clone, env);
    git([...gitCloneConfigArgs(false), 'pull', 'origin', 'main'], clone, env);
    fs.writeFileSync(path.join(clone, 'README'), 'two\n');
    git(['add', 'README'], clone, env);
    git(['commit', '-m', 'two'], clone, env);
    git([...gitCloneConfigArgs(false), 'push', 'origin', 'HEAD:main'], clone, env);
    assert.equal(localSsl(clone), 'true');

    git(['config', '--local', 'http.sslVerify', gitTlsStage(true).sslVerify], clone, env);
    git([...gitCloneConfigArgs(true), 'fetch', 'origin'], clone, env);
    assert.equal(localSsl(clone), 'false');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

function runGit(args, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 8000);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stderr });
    });
  });
}

function certError(text) {
  return /SSL certificate problem|certificate verify failed|unable to get local issuer|server certificate verification failed/i
    .test(String(text || ''));
}

test('self-signed HTTPS follows the effective Git TLS setting', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-git-tls-https-'));
  const key = path.join(work, 'key.pem');
  const cert = path.join(work, 'cert.pem');
  const made = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert,
    '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1'
  ], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  const server = https.createServer({
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert)
  }, (_req, res) => {
    res.writeHead(404);
    res.end('not-a-git-repo');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `https://127.0.0.1:${port}/repo.git`;
  const repo = path.join(work, 'repo');
  fs.mkdirSync(repo);
  const env = gitEnv(work);
  git(['init', '-b', 'main'], repo, env);
  fs.writeFileSync(path.join(repo, 'README'), 'tls\n');
  git(['add', 'README'], repo, env);
  git(['commit', '-m', 'tls'], repo, env);
  try {
    const verifyEnv = buildProcessTlsEnv(gitEnv(work, { GIT_SSL_NO_VERIFY: 'true' }), {
      controllerSkipTls: false,
      gitSkipTls: false
    });
    assert.equal(Object.hasOwn(verifyEnv, 'GIT_SSL_NO_VERIFY'), false);
    for (const verb of [
      ['ls-remote', url],
      ['fetch', url],
      ['pull', url],
      ['push', url, 'HEAD:main']
    ]) {
      const verified = await runGit([...gitCloneConfigArgs(false), ...verb], repo, verifyEnv);
      assert.notEqual(verified.status, 0);
      assert.equal(certError(verified.stderr), true, verified.stderr);

      const skipped = await runGit(
        [...gitCloneConfigArgs(true), ...verb],
        repo,
        buildProcessTlsEnv(gitEnv(work), { controllerSkipTls: false, gitSkipTls: true })
      );
      assert.notEqual(skipped.status, 0);
      assert.equal(certError(skipped.stderr), false, skipped.stderr);
      assert.equal(String(skipped.stderr).includes(TOKEN), false);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(work, { recursive: true, force: true });
  }
});
