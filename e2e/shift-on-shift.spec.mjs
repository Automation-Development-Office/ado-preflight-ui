import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const example = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../examples/preflight-shift-on-shift.example.json'
);

test.describe('Shift on Shift', () => {
  test('imported hosted clusters render with review, validation, and add', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Upload JSON' })
      .locator('xpath=preceding-sibling::input[@type="file"]')
      .setInputFiles(example);
    // Import is asynchronous and resets the wizard sections when it finishes.
    await expect(page.getByText('Loaded preflight-shift-on-shift.example.json')).toBeVisible();

    const tab = page.getByRole('tab', { name: 'Shift on Shift' });
    if (!(await tab.isVisible())) {
      await page.getByRole('button', { name: /Step 2\.\s+Component Configuration/ }).click();
    }
    await tab.click();

    await expect(page.getByRole('button', { name: 'Add hosted cluster' })).toBeVisible();
    await expect(page.getByText('Allow wildcard route admission on the management cluster (explicit opt-in)')).toBeVisible();
    await expect(page.getByText('clusters-tenant-a', { exact: true })).toBeVisible();
    // The example ships a CHANGE_ME pull secret, which must be flagged before any run.
    await expect(page.getByText('tenant-b: Pull secret must be valid JSON')).toBeVisible();
    await expect(page.getByText(/ADO \| Shift on Shift \| Validate prerequisites/)).toBeVisible();

    await page.getByRole('button', { name: 'Add hosted cluster' }).click();
    await expect(page.getByText('clusters-hosted-3', { exact: true })).toBeVisible();
  });
});
