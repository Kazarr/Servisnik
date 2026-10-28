import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PrintLinks } from '../src/app/(app)/zakazky/[id]/print-links.tsx';

// The page of a Zákazka is an async Server Component, which Vitest cannot run (docs/adr/0001-stack.md). The links
// to the printed forms are a plain component, rendered here; e2e/job-sheet.spec.ts follows one to the PDF.

const id = '7d1c0a3e-0000-4000-8000-000000000001';

test('the detail of a Zákazka links to the zákazkový list at the address of its Route Handler', () => {
  const html = renderToStaticMarkup(createElement(PrintLinks, { workOrderId: id }));

  expect(html).toContain(`<a class="button" href="/zakazky/${id}/zakazkovy-list">Zákazkový list</a>`);
});
