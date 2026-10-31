'use strict';

const fs = require('fs');
const path = require('path');

/**
 * HTTPS git username for clone, push, and Controller SCM.
 * A typed username wins. Blank Bitbucket uses x-token-auth.
 * Blank GitLab/GitHub stays oauth2. This does not perform SAML.
 */
function resolveGitUsername(scmTool, username) {
  const trimmed = String(username || '').trim();
  if (trimmed) return trimmed;
  const tool = String(scmTool || '').trim().toLowerCase();
  if (tool === 'bitbucket') return 'x-token-auth';
  return 'oauth2';
}

function cleanGitRemoteUrl(repoUrl) {
  const raw = String(repoUrl || '');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return raw.replace(/\/\/(?:[^/@\s]+)(?::[^/@\s]*)?@/g, '//');
  }
}

function authenticatedGitUrl(repoUrl) {
  return cleanGitRemoteUrl(repoUrl);
}

function gitCredentialLine(repoUrl, token, username, scmTool = 'gitlab') {
  const remote = new URL(cleanGitRemoteUrl(repoUrl));
  const user = encodeURIComponent(resolveGitUsername(scmTool, username));
  const password = encodeURIComponent(String(token || ''));
  return `${remote.protocol}//${user}:${password}@${remote.host}\n`;
}

function gitBearerConfig(token) {
  return `[http]\n\textraHeader = Authorization: Bearer ${String(token || '').trim()}\n`;
}

function adoGitCredentialPaths(homeDir) {
  const home = homeDir || process.env.HOME || '/tmp';
  return {
    home,
    credentials: path.join(home, '.ado-git-credentials'),
    bearer: path.join(home, '.ado-git-bearer')
  };
}

function writeRestrictedFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

/**
 * Persist Git auth in ADO-owned files. Does not write ~/.git-credentials.
 * Bearer (Bitbucket) and store (GitLab/GitHub) stay separate.
 */
function writeAdoGitCredentials({
  repoUrl,
  token,
  username = '',
  scmTool = 'gitlab',
  homeDir
} = {}) {
  const paths = adoGitCredentialPaths(homeDir);
  const tool = String(scmTool || 'gitlab').trim().toLowerCase();
  if (!token) {
    return { kind: 'none', path: '', helper: '' };
  }
  if (tool === 'bitbucket') {
    writeRestrictedFile(paths.bearer, gitBearerConfig(token));
    return { kind: 'bearer', path: paths.bearer, helper: '' };
  }
  writeRestrictedFile(
    paths.credentials,
    gitCredentialLine(repoUrl, token, username, tool)
  );
  return {
    kind: 'store',
    path: paths.credentials,
    helper: `store --file ${paths.credentials}`
  };
}

/** Remove only ADO credential files. Leave ~/.git-credentials alone. */
function clearAdoGitCredentials(homeDir) {
  const paths = adoGitCredentialPaths(homeDir);
  const removed = [];
  for (const file of [paths.credentials, paths.bearer]) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
      removed.push(file);
    }
  }
  return removed;
}

function redactSecretsForLog(text) {
  return String(text || '')
    .replace(/("(?:oauth_token|oauthtoken|galaxy_hub_token|vault_controller_oauthtoken|controller_oauthtoken|token|password|admin_password)"\s*:\s*")[^"]*(")/gi, '$1[redacted]$2')
    .replace(/('(?:oauth_token|oauthtoken|galaxy_hub_token|vault_controller_oauthtoken|controller_oauthtoken|token|password|admin_password)'\s*:\s*')[^']*(')/gi, '$1[redacted]$2')
    .replace(/((?:vault_controller_oauthtoken|controller_oauthtoken|oauth_token|galaxy_hub_token|token|password|admin_password)\s*:\s*)(\S+)/gi, '$1[redacted]')
    .replace(/(-e\s+\S*(?:git_token|password|oauth_token)=)\S+/gi, '$1[redacted]')
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer ***')
    .replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://***:***@');
}

module.exports = {
  resolveGitUsername,
  cleanGitRemoteUrl,
  authenticatedGitUrl,
  gitCredentialLine,
  gitBearerConfig,
  adoGitCredentialPaths,
  writeAdoGitCredentials,
  clearAdoGitCredentials,
  redactSecretsForLog
};
