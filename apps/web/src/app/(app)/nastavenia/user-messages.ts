import { passwordLength } from '@servisnik/domain/access';

/** What the forms of Používatelia tell the admin when they refuse something, reason by reason. */
export const userMessages = {
  name: 'Vyplňte meno používateľa',
  email: { format: 'Zadajte e-mail v tvare meno@domena.sk', taken: 'Používateľ s týmto e-mailom už existuje' },
  role: { invalid: 'Vyberte rolu používateľa', own: 'Svoju rolu nezmeníte' },
  password: {
    tooShort: `Heslo musí mať aspoň ${passwordLength.min} znakov`,
    tooLong: `Heslo smie mať najviac ${passwordLength.max} znakov`,
  },
  deactivateSelf: 'Seba nemôžete deaktivovať',
};
