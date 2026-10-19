import { test, expect } from '@playwright/test';

test.describe('preflight UI smoke', () => {
  test('loads Core Environment', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Ansible Automation Pre-Flight/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Core Environment' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Core Environment Information' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload JSON' })).toBeVisible();
  });

  test('OpenShift Tools tabs: agent and catalog operators', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'OpenShift Tools' }).click();
    await expect(page.getByRole('heading', { name: 'OpenShift Tools' })).toBeVisible();
    await expect(page.getByText('Git repository')).toBeVisible();

    await expect(page.getByRole('tab', { name: 'Agent / install-config' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Catalog operators/ })).toBeVisible();

    await expect(page.getByLabel('OpenShift agent / install configure')).toBeVisible();

    await page.getByRole('tab', { name: /Catalog operators/ }).click();
    await expect(page.getByRole('button', { name: 'Pull available operators' })).toBeVisible();
    await expect(
      page.getByText(/Enter OpenShift API host and token/i)
    ).toBeVisible();
  });

  test('API health endpoints respond', async ({ request }) => {
    const events = await request.get('/api/events');
    expect(events.ok()).toBeTruthy();
  });
});
