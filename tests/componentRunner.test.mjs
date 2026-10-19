import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('component API requires successful generation, validates preview, and runs asynchronously', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-runner-api-'));
  try {
    fs.mkdirSync(path.join(repo, 'playbooks'));
    fs.writeFileSync(path.join(repo, 'playbooks/install.yml'), '- hosts: localhost\n  tasks: []\n');
    fs.copyFileSync('../ado/roles/bootstrap_generate_playbook_repo/files/local_components.py', path.join(repo, 'local_components.py'));
    fs.writeFileSync(path.join(repo, 'component-run-plan.json'), JSON.stringify({ environment: 'example', steps: [{ id: 'install', playbook: 'playbooks/install.yml', available: true, fields: [{ variable: 'password', label: 'Password', required: true, secret: true, default: '' }] }] }));
    const routes = new Map();
    const executions = [];
    const context = vm.createContext({ require, fs, path, execFileSync, JSON, Date,
      app: { get: (p, h) => routes.set(`GET ${p}`, h), post: (p, h) => routes.set(`POST ${p}`, h) },
      localComponentContext: null, bootstrapRunning: false, bootstrapStartedAt: null,
      latestLog: '', latestEvents: '', latestDebug: {}, event: () => {}, append: () => {},
      formatBootstrapRuntime: String,
      resolveLocalComponentsRunner: (repoDir) => path.join(repoDir, 'local_components.py'),
      htpasswdFormVarsFromBootstrapRepo: () => ({}),
      runStream: async (...args) => {
        executions.push(args);
        // Collection refresh (bash) must succeed; component runner returns non-zero for the assertion below.
        if (args[0] === 'bash') return 0;
        return 9;
      }
    });
    const source = fs.readFileSync('server.js', 'utf8');
    vm.runInContext(source.slice(source.indexOf('function stepsIncludeHtpasswd('), source.indexOf("app.get('/api/logs'")), context);
    const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
    let res = response();
    await routes.get('POST /api/components/run')({ body: {} }, res);
    assert.equal(res.code, 400);
    assert.equal(executions.length, 0);
    context.localComponentContext = { id: 'generated-plan', repoDir: repo, env: {} };
    const body = { planId: 'generated-plan', steps: ['install'], values: { install: { password: 'fixture-secret' } }, extra_args: '--check' };
    res = response();
    routes.get('POST /api/components/preview')({ body }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes('fixture-secret'));
    res = response();
    await routes.get('POST /api/components/run')({ body: { ...body, steps: ['../unknown'] } }, res);
    assert.equal(res.code, 400);
    assert.equal(executions.length, 0);
    res = response();
    await routes.get('POST /api/components/run')({ body }, res);
    assert.equal(res.code, 202);
    assert.equal(executions.length, 2);
    assert.equal(context.latestDebug.result.exitCode, 9);
    assert.equal(context.bootstrapRunning, false);
    const file = executions[1][1].at(-1);
    assert.ok(!fs.existsSync(file));
    context.bootstrapRunning = true;
    res = response();
    await routes.get('POST /api/components/run')({ body }, res);
    assert.equal(res.code, 409);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
