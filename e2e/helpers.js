const fs = require('fs');
const os = require('os');
const path = require('path');

async function openActions(page) {
  await page.getByTestId('actions-menu').scrollIntoViewIfNeeded();
  await page.getByTestId('actions-menu').click();
}

async function saveDownload(download) {
  const downloadPath = path.join(os.tmpdir(), `ado-preflight-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(downloadPath);
  return downloadPath;
}

async function downloadPreflightJson(page) {
  await openActions(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download JSON', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await saveDownload(download);
  const payload = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
  fs.unlinkSync(downloadPath);
  return payload;
}

async function downloadScrubbedPreflightJson(page) {
  await openActions(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Download scrubbed JSON/i }).click();
  const download = await downloadPromise;
  const downloadPath = await saveDownload(download);
  const payload = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
  fs.unlinkSync(downloadPath);
  return payload;
}

async function openHelpMenu(page) {
  await page.locator('[class*="masthead"]').getByRole('button', { name: '?' }).click();
}

async function openConsoleTab(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
}

async function openDebugSubTab(page, name) {
  await openConsoleTab(page, 'Events / Debug');
  await page.getByRole('tab', { name, exact: true }).click();
}

module.exports = {
  openActions,
  downloadPreflightJson,
  downloadScrubbedPreflightJson,
  openHelpMenu,
  openConsoleTab,
  openDebugSubTab
};
