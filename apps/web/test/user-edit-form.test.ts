import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { UserEditForm } from '../src/app/(app)/nastavenia/user-edit-form.tsx';
import { input, options } from './support/form-markup.ts';

// The pages of Používatelia are async Server Components, which Vitest cannot run (docs/adr/0001-stack.md); the form
// that edits a Používateľ is a plain component, rendered here as the page renders it. A form without the field of
// the Rola is what makes updateUserAction leave the Rola alone (test/user-actions.test.ts).

const initial = { name: 'Ján Novák', email: 'jan@autoservis.test', role: 'mechanik' };
const render = (props: { ownRole?: 'admin' | 'mechanik' } = {}) => renderToStaticMarkup(createElement(UserEditForm, { userId: 'u1', initial, ...props }));

test("the form of another user's page has the field of the Rola, with his Rola chosen", () => {
  expect(options(render(), 'userRole')).toEqual({ values: ['admin', 'mechanik'], selected: ['mechanik'] });
});

test("the form of the admin's own page has no field of the Rola, and says that he cannot change it", () => {
  const html = render({ ownRole: 'admin' });

  expect(html).not.toContain('name="userRole"');
  expect(html).toContain('Rola: Admin. Svoju rolu nezmeníte.');
  expect(input(html, 'userName')).toContain('value="Ján Novák"'); // the name and e-mail are his to change
  expect(input(html, 'userEmail')).toContain('value="jan@autoservis.test"');
});
