const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  openActions,
  downloadPreflightJson,
  downloadScrubbedPreflightJson,
  openHelpMenu,
  openConsoleTab,
  openDebugSubTab
} = require('./helpers');

const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'minimal-openshift.json');

test.describe('ADO Preflight UI', () => {
  test('loads the main shell', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ADO Preflight UI/i);
    await expect(page.getByText('Automation Development Office')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Ansible Automation Pre-Flight Questionnaire/i })).toBeVisible();
    await expect(page.getByTestId('environment-input')).toBeVisible();
  });

  test('downloads and re-imports preflight JSON', async ({ page }) => {
    await page.goto('/');

    const environmentInput = page.getByTestId('environment-input');
    await environmentInput.fill('ci-roundtrip');
    await environmentInput.blur();

    await openActions(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Download JSON', exact: true }).click();
    const download = await downloadPromise;
    const downloadPath = path.join(require('os').tmpdir(), `ado-preflight-${Date.now()}.json`);
    await download.saveAs(downloadPath);
    const payload = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));

    expect(payload.environment).toBe('ci-roundtrip');
    expect(payload).toHaveProperty('components');
    expect(payload).toHaveProperty('aap');
    expect(payload).toHaveProperty('git');

    await environmentInput.fill('before-import');
    await page.getByTestId('upload-json-button').click();
    await page.getByTestId('import-json-input').setInputFiles(downloadPath);

    await expect(page.getByText(/Loaded .*\.json/)).toBeVisible();
    await expect(environmentInput).toHaveValue('ci-roundtrip');

    fs.unlinkSync(downloadPath);
  });

  test('preview JSON reflects the environment field', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('environment-input').fill('preview-test');

    await openActions(page);
    await page.getByRole('menuitem', { name: 'Preview JSON', exact: true }).click();

    await expect(page.getByRole('tab', { name: 'Logs', exact: true })).toBeVisible();
    await expect(page.getByText('"environment": "preview-test"')).toBeVisible();
  });

  test('download scrubbed JSON redacts sensitive fields', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('upload-json-button').click();
    await page.getByTestId('import-json-input').setInputFiles({
      name: 'secrets.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        environment: 'scrub-test',
        git: { token: 'super-secret-token' },
        aap: {
          hostname: 'https://controller.example.com',
          admin_password: 'hunter2'
        }
      }))
    });
    await expect(page.getByText(/Loaded secrets\.json/)).toBeVisible();

    const payload = await downloadScrubbedPreflightJson(page);

    expect(payload._scrubbed).toBe(true);
    expect(payload.git.token).toBe('[redacted]');
    expect(payload.aap.admin_password).toBe('[redacted]');
    expect(JSON.stringify(payload)).not.toContain('super-secret-token');
    expect(JSON.stringify(payload)).not.toContain('hunter2');
  });

  test('rejects invalid JSON imports', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('upload-json-button').click();
    await page.getByTestId('import-json-input').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ definitely not json')
    });

    await expect(page.getByText(/Import failed:/)).toBeVisible();
  });

  test('imports a fixture JSON file', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('upload-json-button').click();
    await page.getByTestId('import-json-input').setInputFiles(fixturePath);

    await expect(page.getByText(/Loaded minimal-openshift\.json/)).toBeVisible();
    await expect(page.getByTestId('environment-input')).toHaveValue('dev');
  });

  test('enabling AWS appears in downloaded JSON', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'aws', exact: true }).locator('..').getByRole('checkbox').check();

    const payload = await downloadPreflightJson(page);
    expect(payload.components).toContain('aws');
  });

  test('additional environment presets appear in downloaded JSON', async ({ page }) => {
    await page.goto('/');
    await page.locator('#additional-env-dev').check();

    const payload = await downloadPreflightJson(page);
    expect(payload.additional_environments.map(name => String(name).toLowerCase())).toContain('dev');
  });

  test('opens UI documentation from the help menu', async ({ page }) => {
    await page.goto('/');
    await openHelpMenu(page);
    await page.getByRole('menuitem', { name: 'ADO Preflight UI Documentation', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'ADO Preflight UI Documentation' }).first()).toBeVisible();
    await expect(page.getByText(/ADO Preflight UI/i).first()).toBeVisible();
  });

  test('debug tabs load without errors', async ({ page }) => {
    await page.goto('/');

    await openDebugSubTab(page, 'Summary');
    await expect(page.getByText(/"logBytes"/)).toBeVisible();

    await openDebugSubTab(page, 'Runtime');
    await expect(page.getByText(/"uiVersion"/)).toBeVisible();

    await openDebugSubTab(page, 'Preflight JSON');
    await expect(page.getByText('# Preflight JSON — written to')).toBeVisible();
  });

  test('reset clears preview output and restores defaults', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('environment-input').fill('reset-me');

    await openActions(page);
    await page.getByRole('menuitem', { name: 'Preview JSON', exact: true }).click();
    await expect(page.getByText('"environment": "reset-me"')).toBeVisible();

    await openActions(page);
    await page.getByRole('menuitem', { name: 'Reset', exact: true }).click();

    await expect(page.getByText('Click "Run Bootstrap" to generate output.')).toBeVisible();
    await expect(page.getByTestId('environment-input')).toHaveValue('prod');
  });

  test('theme toggle keeps the main form usable', async ({ page }) => {
    await page.goto('/');
    const environmentInput = page.getByTestId('environment-input');
    await environmentInput.fill('theme-check');

    const themeButton = page.getByRole('button', { name: /Switch to (light|dark) theme/i });
    await themeButton.click();

    await expect(environmentInput).toBeVisible();
    await expect(environmentInput).toHaveValue('theme-check');
  });
});
