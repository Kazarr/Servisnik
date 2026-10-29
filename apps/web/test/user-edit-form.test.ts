import type { Role } from '@servisnik/domain/access';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { UserEditForm } from '../src/app/(app)/nastavenia/user-edit-form.tsx';
import { input, options } from './support/form-markup.ts';

// The pages of Používatelia are async Server Components, which Vitest cannot run (docs/adr/0001-stack.md); the form
// that edits a Používateľ is a plain component, rendered here as the page renders it. A form without the field of
// the Rola is what makes updateUserAction leave the Rola alone (test/user-actions.test.ts).

/** The form as the page of a user with this Rola renders it: on the admin's own page `ownRole` is the Rola the form starts with. */
const render = (role: Role, own = false) =>
  renderToStaticMarkup(createElement(UserEditForm, { userId: 'u1', initial: { name: 'Ján Novák', email: 'jan@autoservis.test', role }, ...(own && { ownRole: role }) }));

test("the form of another user's page has the field of the Rola, with his Rola chosen", () => {
  expect(options(render('mechanik'), 'userRole')).toEqual({ values: ['admin', 'mechanik'], selected: ['mechanik'] });
});

test("the form of the admin's own page has no field of the Rola, and says that he cannot change it", () => {
  const html = render('admin', true);

  expect(html).not.toContain('name="userRole"');
  expect(html).toContain('Rola: Admin. Svoju rolu nezmeníte.');
  expect(input(html, 'userName')).toContain('value="Ján Novák"'); // the name and e-mail are his to change
  expect(input(html, 'userEmail')).toContain('value="jan@autoservis.test"');
});
