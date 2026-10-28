import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PrintLinks } from '../src/app/(app)/zakazky/[id]/print-links.tsx';

// The page of a Zákazka is an async Server Component, which Vitest cannot run (docs/adr/0001-stack.md). The links
// to the printed forms are a plain component, rendered here; e2e/job-sheet.spec.ts and e2e/print-forms.spec.ts follow them to the PDF.

const id = '7d1c0a3e-0000-4000-8000-000000000001';

const render = (role: 'admin' | 'mechanik') => renderToStaticMarkup(createElement(PrintLinks, { workOrderId: id, role }));

test('the detail of a Zákazka links to the zákazkový list at the address of its Route Handler', () => {
  expect(render('admin')).toContain(`<a class="button" href="/zakazky/${id}/zakazkovy-list">Zákazkový list</a>`);
});

test('the detail of a Zákazka links the admin to the cenová ponuka and to the odovzdávací protokol at the addresses of their Route Handlers', () => {
  const html = render('admin');

  expect(html).toContain(`<a class="button" href="/zakazky/${id}/cenova-ponuka">Cenová ponuka</a>`);
  expect(html).toContain(`<a class="button" href="/zakazky/${id}/odovzdavaci-protokol">Odovzdávací protokol</a>`);
});

// Their Route Handlers answer him 403 (work-orders.quote and work-orders.handover are the admin's), so a button to them would only fail.
test('the mechanik is linked to the zákazkový list only, not to the cenová ponuka nor to the odovzdávací protokol', () => {
  const html = render('mechanik');

  expect(html).toContain(`<a class="button" href="/zakazky/${id}/zakazkovy-list">Zákazkový list</a>`);
  expect(html).not.toContain('cenova-ponuka');
  expect(html).not.toContain('odovzdavaci-protokol');
  expect(html).not.toContain('Cenová ponuka');
  expect(html).not.toContain('Odovzdávací protokol');
});
