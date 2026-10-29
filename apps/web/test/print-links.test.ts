import type { WorkOrderStatus } from '@servisnik/domain/work-order';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PrintLinks } from '../src/app/(app)/zakazky/[id]/print-links.tsx';

// The page of a Zákazka is an async Server Component, which Vitest cannot run (docs/adr/0001-stack.md). The links
// to the printed forms are a plain component, rendered here; e2e/job-sheet.spec.ts and e2e/print-forms.spec.ts follow them to the PDF.

const id = '7d1c0a3e-0000-4000-8000-000000000001';

const render = (role: 'admin' | 'mechanik', status: WorkOrderStatus = 'inProgress') => renderToStaticMarkup(createElement(PrintLinks, { workOrderId: id, role, status }));

const jobSheetLink = `<a class="button" href="/zakazky/${id}/zakazkovy-list">Zákazkový list</a>`;
const quoteLink = `<a class="button" href="/zakazky/${id}/cenova-ponuka">Cenová ponuka</a>`;
const protocolLink = `<a class="button" href="/zakazky/${id}/odovzdavaci-protokol">Odovzdávací protokol</a>`;

test('the detail of a Zákazka links to the zákazkový list at the address of its Route Handler', () => {
  expect(render('admin')).toContain(jobSheetLink);
});

test.each(['received', 'inProgress', 'waitingForParts', 'done', 'invoiced', 'cancelled'] as const)(
  'the detail of a Zákazka that is %s links the admin to the cenová ponuka at the address of its Route Handler',
  (status) => {
    expect(render('admin', status)).toContain(quoteLink);
  },
);

// The customer takes the vehicle over when the work is done (Kazarr, #139), and the Route Handler refuses the protocol in the other statuses (409), so a button there would only fail.
test.each(['done', 'invoiced'] as const)('the detail of a Zákazka that is %s links the admin to the odovzdávací protokol at the address of its Route Handler', (status) => {
  expect(render('admin', status)).toContain(protocolLink);
});

test.each(['received', 'inProgress', 'waitingForParts', 'cancelled'] as const)(
  'the detail of a Zákazka that is %s has no button for the odovzdávací protokol, but still the other two',
  (status) => {
    const html = render('admin', status);

    expect(html).not.toContain('odovzdavaci-protokol');
    expect(html).not.toContain('Odovzdávací protokol');
    expect(html).toContain(jobSheetLink);
    expect(html).toContain(quoteLink);
  },
);

// Their Route Handlers answer him 403 (work-orders.quote and work-orders.handover are the admin's), so a button to them would only fail.
test.each(['inProgress', 'done'] as const)('the mechanik is linked to the zákazkový list only, not to the cenová ponuka nor to the odovzdávací protokol, in a Zákazka that is %s', (status) => {
  const html = render('mechanik', status);

  expect(html).toContain(jobSheetLink);
  expect(html).not.toContain('cenova-ponuka');
  expect(html).not.toContain('odovzdavaci-protokol');
  expect(html).not.toContain('Cenová ponuka');
  expect(html).not.toContain('Odovzdávací protokol');
});
