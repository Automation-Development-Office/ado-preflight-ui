'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  resolveGitUsername,
  cleanGitRemoteUrl,
  authenticatedGitUrl,
  gitCredentialLine,
  gitBearerConfig,
  redactSecretsForLog
} = require('./git-username');

const TOKEN = 'glpat-regression-do-not-log';
const REPO = 'https://gitlab.example.test/group/bootstrap.git';

test('GitLab blank username uses oauth2', () => {
  assert.equal(resolveGitUsername('gitlab', ''), 'oauth2');
  assert.equal(resolveGitUsername('gitlab', '   '), 'oauth2');
  const line = gitCredentialLine(REPO, TOKEN, '', 'gitlab');
  assert.match(line, /^https:\/\/oauth2:/);
  assert.equal(line.includes(TOKEN), true);
  assert.equal(cleanGitRemoteUrl(REPO).includes(TOKEN), false);
});

test('GitLab supplied username is used', () => {
  assert.equal(resolveGitUsername('gitlab', 'saml-user'), 'saml-user');
  const line = gitCredentialLine(REPO, TOKEN, ' saml-user ', 'gitlab');
  assert.match(line, /^https:\/\/saml-user:/);
  assert.equal(new URL(cleanGitRemoteUrl(REPO)).username, '');
  assert.equal(new URL(cleanGitRemoteUrl(REPO)).password, '');
});

test('Bitbucket blank username uses x-token-auth', () => {
  assert.equal(resolveGitUsername('bitbucket', ''), 'x-token-auth');
  const line = gitCredentialLine(REPO, TOKEN, '', 'bitbucket');
  assert.match(line, /^https:\/\/x-token-auth:/);
});

test('resolved username is what Controller SCM and git push share', () => {
  const resolved = resolveGitUsername('gitlab', 'saml-user');
  const line = gitCredentialLine(REPO, TOKEN, resolved, 'gitlab');
  assert.match(line, new RegExp(`^https://${resolved}:`));
  assert.equal(resolveGitUsername('bitbucket', ''), 'x-token-auth');
  assert.equal(authenticatedGitUrl(`https://saml-user:${TOKEN}@gitlab.example.test/group/bootstrap.git`), REPO);
});

test('token is redacted from log text and generated JSON dumps', () => {
  const logged = redactSecretsForLog(
    `git remote set-url origin https://saml-user:${TOKEN}@gitlab.example.test/group/bootstrap.git\n`
    + `Authorization: Bearer ${TOKEN}\n`
    + `-e generate_playbook_repo_git_token=${TOKEN}\n`
    + `{"token":"${TOKEN}","username":"saml-user"}\n`
  );
  assert.equal(logged.includes(TOKEN), false);
  assert.match(logged, /:\/\/\*\*\*:\*\*\*@/);
  assert.match(logged, /Authorization: Bearer \*\*\*/);
  assert.match(logged, /git_token=\[redacted\]/);
  assert.match(logged, /"token":"\[redacted\]"/);
  assert.match(logged, /"username":"saml-user"/);
});

test('bearer config is separate from the remote URL', () => {
  const remote = cleanGitRemoteUrl(REPO);
  const bearer = gitBearerConfig(TOKEN);
  assert.equal(remote.includes(TOKEN), false);
  assert.equal(bearer.includes(TOKEN), true);
  assert.match(bearer, /extraHeader = Authorization: Bearer /);
});

test('server git commands do not embed the token in a remote URL', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.equal(server.includes('authenticatedGitUrl('), false);
  assert.equal(server.includes('generate_playbook_repo_git_token='), false);
  assert.equal(server.includes('bootstrap_generate_playbook_repo_git_token='), false);
  assert.equal(server.includes('bootstrap_generate_playbook_repo_git_username='), false);
  assert.equal(server.includes('http.extraHeader=${'), false);
  assert.equal(server.includes("http.extraHeader', gitBearer"), false);
});
