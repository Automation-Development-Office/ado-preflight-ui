const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

    await page.getByTestId('actions-menu').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Download JSON' }).click();
    const download = await downloadPromise;

    const downloadPath = path.join(os.tmpdir(), `ado-preflight-${Date.now()}.json`);
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
});
