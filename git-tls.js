'use strict';

/**
 * Git TLS and Controller/AAP TLS are separate.
 * controllerSkipTls follows aap.skip_tls_verify.
 * gitSkipTls follows git.skip_tls_verify.
 * Neither flag blanks a trusted CA bundle unless Controller verification is explicitly skipped.
 */

/**
 * Effective Git "skip TLS" flag.
 * true and false are explicit and always win.
 * A missing value skips only when omittedSkips is set (legacy imports and
 * payloads that never contained the key). A new form passes false.
 */
function resolveGitSkipTls(value, { omittedSkips = false } = {}) {
  if (value === true) return true;
  if (value === false) return false;
  return omittedSkips === true;
}

/**
 * Import merge copies the new-form default (false) into a file that omitted
 * the key. Put the legacy skip back so the checkbox matches what Git will do.
 * An explicit true or false on the imported object is kept.
 */
function applyImportedGitSkipTls(git, incomingGit) {
  const next = git && typeof git === 'object' ? { ...git } : {};
  const incoming = incomingGit && typeof incomingGit === 'object'
    ? incomingGit.skip_tls_verify
    : undefined;
  next.skip_tls_verify = resolveGitSkipTls(incoming, { omittedSkips: true });
  return next;
}

function gitTlsStage(skipTlsVerify) {
  const skip = resolveGitSkipTls(skipTlsVerify, { omittedSkips: false });
  return {
    skipTlsVerify: skip,
    checkboxChecked: skip,
    sslVerify: skip ? 'false' : 'true',
    label: skip
      ? 'Effective Git TLS: verification disabled (Skip TLS is on)'
      : 'Effective Git TLS: verification enabled'
  };
}

function gitHttpSslVerifyValue(gitSkipTls) {
  return gitTlsStage(gitSkipTls).sslVerify;
}

function gitCloneConfigArgs(gitSkipTls) {
  return ['-c', `http.sslVerify=${gitHttpSslVerifyValue(gitSkipTls)}`];
}

function buildProcessTlsEnv(baseEnv = {}, { controllerSkipTls = false, gitSkipTls = false } = {}) {
  const env = { ...baseEnv };
  if (controllerSkipTls === true) {
    env.CONTROLLER_VERIFY_SSL = 'false';
    env.TOWER_VERIFY_SSL = 'false';
    env.ANSIBLE_TLS_VERIFY = 'false';
    env.REQUESTS_CA_BUNDLE = '';
    env.CURL_CA_BUNDLE = '';
    env.PYTHONHTTPSVERIFY = '0';
  } else {
    env.CONTROLLER_VERIFY_SSL = 'true';
    env.TOWER_VERIFY_SSL = 'true';
    delete env.ANSIBLE_TLS_VERIFY;
    delete env.PYTHONHTTPSVERIFY;
  }
  if (gitSkipTls === true) {
    env.GIT_SSL_NO_VERIFY = 'true';
  } else {
    delete env.GIT_SSL_NO_VERIFY;
  }
  return env;
}

function ansibleTlsShellLines({ controllerSkipTls = false, gitSkipTls = false } = {}) {
  const lines = [];
  if (controllerSkipTls === true) {
    lines.push('export ANSIBLE_TLS_VERIFY=false');
    lines.push('export CONTROLLER_VERIFY_SSL=false');
    lines.push('export TOWER_VERIFY_SSL=false');
    lines.push('export REQUESTS_CA_BUNDLE=');
    lines.push('export CURL_CA_BUNDLE=');
    lines.push('export PYTHONHTTPSVERIFY=0');
  } else {
    lines.push('export CONTROLLER_VERIFY_SSL=true');
    lines.push('export TOWER_VERIFY_SSL=true');
    lines.push('unset PYTHONHTTPSVERIFY || true');
  }
  if (gitSkipTls === true) {
    lines.push('export GIT_SSL_NO_VERIFY=true');
  } else {
    lines.push('unset GIT_SSL_NO_VERIFY || true');
  }
  return lines.join('\n');
}

module.exports = {
  resolveGitSkipTls,
  applyImportedGitSkipTls,
  gitTlsStage,
  gitHttpSslVerifyValue,
  gitCloneConfigArgs,
  buildProcessTlsEnv,
  ansibleTlsShellLines
};
