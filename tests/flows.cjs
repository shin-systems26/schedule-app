// Optional headless runner for the same browser-based fixture tests.
// Run: node tests/server.cjs (another terminal), then node --test tests/flows.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
test('dashboard and participant integration flows', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + (process.env.PORT || 8765) + '/tests/browser.html');
    await page.waitForFunction(() => document.querySelector('#summary').textContent.includes('failed'));
    assert.equal(await page.locator('#summary').innerText(), '11 passed / 0 failed');
  } finally { await browser.close(); }
});
