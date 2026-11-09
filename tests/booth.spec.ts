import { test, expect, chromium, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('landing, join validation, setup, and responsive layouts', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Different places. One photo.' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width === 390 || width === 1440)
      await page.screenshot({ path: info.outputPath(`landing-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Join a Booth', exact: true }).click();
  await page.getByLabel('Invitation link', { exact: true }).fill('invalid-link');
  await page.getByRole('dialog').getByRole('button', { name: 'Join a Booth' }).click();
  await expect(page.getByRole('alert')).toContainText('Paste the full invitation');
  await page.getByRole('button', { name: 'Close join dialog' }).click();
  await page.getByRole('button', { name: 'Create a Booth' }).click();
  await expect(page.getByRole('button', { name: 'Create my private booth' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Enable camera' })).toBeVisible();
  expect(errors).toEqual([]);
});

async function camera(page: Page) {
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restart camera' })).toBeVisible();
}
test('two browser peers use real WebRTC with synthetic test cameras and receive identical PNGs', async ({
  browser,
}, info) => {
  // Synthetic camera sources are enabled ONLY by the browser test runner flags.
  const a = await browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 1440, height: 1000 },
  });
  // Separate browser processes give each synthetic device an independent capture service.
  const guestBrowser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-device-for-media-stream'],
  });
  const b = await guestBrowser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 390, height: 844 },
  });
  const host = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [];
  for (const page of [host, guest]) page.on('pageerror', (e) => errors.push(e.message));
  try {
    await host.goto('http://localhost:5173');
    await host.getByRole('button', { name: 'Create a Booth' }).click();
    await camera(host);
    await host.getByRole('button', { name: 'Create my private booth' }).click();
    const invite = await host
      .getByRole('textbox', { name: 'Private invitation link' })
      .inputValue();
    await guest.goto(invite);
    await camera(guest);
    await guest.getByRole('button', { name: 'Ask to join the booth' }).click();
    await expect(guest.getByRole('button', { name: 'Waiting for approval…' })).toBeVisible();
    await host.getByRole('button', { name: 'Let them in' }).click();
    await expect(host.getByRole('status').filter({ hasText: 'Together in the booth' })).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(
      guest.getByRole('status').filter({ hasText: 'Together in the booth' }),
    ).toBeVisible();
    await expect
      .poll(() => guest.locator('.partner video').evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);
    await expect
      .poll(() => host.locator('.partner video').evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);
    await host.getByLabel('Your names').fill('Alex & Sam');
    await host.getByRole('button', { name: /Rose scrapbook/ }).click();
    await expect(guest.getByLabel('Your names')).toHaveValue('Alex & Sam');
    expect(
      await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await host.screenshot({ path: info.outputPath('booth-desktop.png'), fullPage: true });
    await guest.screenshot({ path: info.outputPath('booth-mobile.png'), fullPage: true });
    await host.getByRole('button', { name: 'Ready when you are' }).click();
    await guest.getByRole('button', { name: 'Ready when you are' }).click();
    await expect(host.getByRole('button', { name: 'Take our photos' })).toBeEnabled();
    await host.getByRole('button', { name: 'Take our photos' }).click();
    await expect(guest.locator('.countdown')).toHaveCount(2);
    // At mobile sizes both countdown panels must be visible at once.
    const panels = await guest.locator('.camera-grid').boundingBox();
    expect(panels!.height).toBeLessThan(450);
    expect(panels!.y).toBeGreaterThanOrEqual(0);
    expect(panels!.y + panels!.height).toBeLessThanOrEqual(844);
    await expect(host.getByRole('button', { name: 'Download PNG' })).toBeVisible({
      timeout: 40_000,
    });
    await expect(guest.getByRole('button', { name: 'Download PNG' })).toBeVisible();
    const [hd] = await Promise.all([
      host.waitForEvent('download'),
      host.getByRole('button', { name: 'Download PNG' }).click(),
    ]);
    const [gd] = await Promise.all([
      guest.waitForEvent('download'),
      guest.getByRole('button', { name: 'Download PNG' }).click(),
    ]);
    const hb = await readFile((await hd.path())!),
      gb = await readFile((await gd.path())!);
    expect(hb.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(hb.readUInt32BE(16)).toBe(1000);
    expect(hb.readUInt32BE(20)).toBe(1420);
    expect(createHash('sha256').update(hb).digest('hex')).toBe(
      createHash('sha256').update(gb).digest('hex'),
    );
    await guest.screenshot({ path: info.outputPath('result-mobile.png'), fullPage: true });
    await guest.getByRole('button', { name: 'Discard photos' }).click();
    await expect(host.getByRole('button', { name: 'Take our photos' })).toBeVisible();
    await expect
      .poll(() => host.locator('.partner video').evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);
    await expect
      .poll(() => guest.locator('.partner video').evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);
    await guest.getByRole('button', { name: 'Leave booth' }).click();
    await expect(
      host.getByRole('status').filter({ hasText: 'Your person has left' }),
    ).toBeVisible();
    await host.getByRole('button', { name: 'Leave booth' }).click();
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
    await guestBrowser.close();
  }
});
