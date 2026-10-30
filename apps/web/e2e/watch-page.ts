import type { ConsoleMessage, Page } from '@playwright/test';

/**
 * The 404 of the image of the logo, which is no problem of the page that got it. The logo is one row for all the specs, and
 * logo.spec.ts removes it; every page of the app has the logo in its menu while it is there (ticket #150), so a page that was
 * made just before the removal asks for an image that is gone. The text of the message does not name the address, its location does.
 */
const logoGone = (message: ConsoleMessage) => /status of 404/.test(message.text()) && new URL(message.location().url || 'http://localhost/').pathname === '/api/logo';

/**
 * The rules of the `context` fixture in fixtures.ts, which applies them to every page of the context: a
 * console error, an uncaught page exception and an HTTP 5xx are problems. Returns the list that gains
 * one line per problem as the page runs.
 * Chromium also logs every failed response as a console error, so the 5xx rule overlaps with the
 * first one; it stays because it names the status and URL.
 */
export function watchPage(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !logoGone(message)) problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}
