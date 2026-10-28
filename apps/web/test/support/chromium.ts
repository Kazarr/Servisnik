import { chromium, type Browser } from 'playwright-core';
import { vi } from 'vitest';

/**
 * Records every Chromium the code under test starts, in order, so that a test can count them, take one away
 * and close them all when it is done. Vitest clears the calls of a spy before each test, and the tests that
 * count launches count across tests, so the list is kept here.
 */
export function watchChromium() {
  const launched: Browser[] = [];
  const launch = chromium.launch.bind(chromium);
  vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
    const browser = await launch(options);
    launched.push(browser);
    return browser;
  });
  return { launched, closeAll: () => Promise.all(launched.map((browser) => browser.close())) };
}
