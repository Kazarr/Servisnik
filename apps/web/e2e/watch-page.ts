import type { Page } from '@playwright/test';

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
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}
