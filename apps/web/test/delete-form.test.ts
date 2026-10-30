import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DeleteForm, type DeleteState } from '../src/app/(app)/delete-form.tsx';

// Mazanie (spec #67), the question on a detail page: when "Potvrdiť zmazanie" was refused, the page says why. useActionState holds the answer of the action in the browser, and renderToStaticMarkup does not run it, so
// the hook is handed the answer a refused delete leaves (test/deletion-actions.test.ts has the action's own answers).

const { answered } = vi.hoisted(() => ({ answered: { state: null as DeleteState } }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: (action: unknown) => [answered.state, action, false],
}));

const render = (state: DeleteState) => {
  answered.state = state;
  return renderToStaticMarkup(createElement(DeleteForm, { id: 'c1', action: async () => null, label: 'Zmazať zákazníka', question: 'Zmazať zákazníka Ján Novák? Zmazanie nemožno vrátiť.' }));
};

test('a delete that was refused is explained in an alert', () => {
  const html = render({ error: 'Zákazník má vozidlo alebo zákazku, preto ho nemožno zmazať' });

  expect(html).toContain('<p role="alert" class="error">Zákazník má vozidlo alebo zákazku, preto ho nemožno zmazať</p>');
});

test('a question nobody answered yet has no alert', () => {
  expect(render(null)).not.toContain('role="alert"');
});
