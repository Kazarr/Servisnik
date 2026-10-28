import { chromium, type Browser } from 'playwright-core';
import { footerTemplate, pageMargins } from './styles.ts';

// Printing (docs/adr/0001-stack.md): Chromium turns the HTML of a form into a PDF. One Chromium serves the
// whole process, started by the first print: starting it takes seconds, and each instance holds memory that
// the one small instance of the app should not spend twice. The promise is kept, not the browser, so prints
// that arrive together share the launch.

let started: Promise<Browser> | null = null;

function sharedBrowser() {
  if (started) return started;
  const launching: Promise<Browser> = chromium
    .launch({ args: ['--disable-dev-shm-usage'] }) // /dev/shm of a container is 64 MB, which a page of Chromium outgrows
    .then((browser) => {
      browser.on('disconnected', () => {
        if (started === launching) started = null; // crashed or closed: the next print starts a new one
      });
      return browser;
    })
    .catch((error) => {
      if (started === launching) started = null; // a failed launch is not kept: the next print tries again
      throw error;
    });
  return (started = launching);
}

/**
 * The PDF of `html` on A4, with margins, backgrounds, and "Strana X/Y" at the bottom of every page. The page
 * runs no script and has no network, so nothing a form carries (a customer's text) can do anything but be
 * printed: an address in it is never asked for.
 */
export async function printPdf(html: string): Promise<Uint8Array> {
  const context = await (await sharedBrowser()).newContext({ javaScriptEnabled: false, offline: true, locale: 'sk-SK' });
  try {
    const page = await context.newPage();
    await page.setContent(html);
    return await page.pdf({
      format: 'A4',
      margin: pageMargins,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>', // the default header is the date and the title
      footerTemplate,
    });
  } finally {
    await context.close();
  }
}
