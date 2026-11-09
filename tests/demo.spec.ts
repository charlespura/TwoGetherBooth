import { test, expect } from '@playwright/test';

test('narrated demo plays on desktop and mobile without requesting a camera', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error('The demo must not request camera or microphone access');
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const mediaRequests: string[] = [];
    const onRequest = (request: { url: () => string }) => {
      if (request.url().endsWith('.mp4')) mediaRequests.push(request.url());
    };
    page.on('request', onRequest);
    await page.goto('/');
    expect(mediaRequests).toHaveLength(0);
    const trigger = page.getByRole('button', { name: /Watch demo/ });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'See a memory come together.' });
    await expect(dialog).toBeVisible();
    const video = dialog.locator('video');
    await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.2);
    const media = await video.evaluate((element) => ({
      muted: element.muted,
      duration: element.duration,
      width: element.videoWidth,
      height: element.videoHeight,
      audioTracks: (element as HTMLVideoElement & { captureStream: () => MediaStream })
        .captureStream()
        .getAudioTracks().length,
    }));
    expect(media.muted).toBe(false);
    expect(media.audioTracks).toBe(1);
    expect(media.duration).toBeGreaterThan(20);
    expect(media.duration).toBeLessThan(100);
    expect(media.width).toBe(1440);
    expect(media.height).toBe(1080);
    await expect(video.locator('track')).toHaveAttribute('src', '/demo/twogether-demo.en.vtt');
    await video.evaluate((element) => {
      element.textTracks[0].mode = 'showing';
    });
    await expect
      .poll(() => video.evaluate((element) => element.textTracks[0].cues?.length ?? 0))
      .toBe(12);
    // Pause and seeking use the video's embedded audio, keeping narration in sync.
    await video.evaluate((element) => element.pause());
    const pausedAt = await video.evaluate((element) => element.currentTime);
    await page.waitForTimeout(150);
    expect(await video.evaluate((element) => element.currentTime)).toBe(pausedAt);
    await video.evaluate((element) => {
      element.currentTime = 10;
    });
    await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(9);
    await video.evaluate((element) => element.play());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByText('Read the walkthrough').click();
    await expect(dialog.getByText(/Both receive the same photo strip/)).toBeVisible();
    if (width === 1440) await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Close demo' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    page.off('request', onRequest);
  }
  expect(errors).toEqual([]);
});
