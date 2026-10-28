import type { FormatField } from '@servisnik/domain/customer';

/**
 * What a form tells the user whose IČO, DIČ, IČ DPH, PSČ or e-mail is in the wrong shape. The shapes are
 * the Zákazník area's (formatErrors in packages/domain/src/customer), so every form that has these
 * fields says the same, and a field that gets a format there but no message here does not compile.
 */
export const formatMessages = {
  ico: 'IČO má mať presne 8 číslic',
  dic: 'DIČ má mať presne 10 číslic',
  icDph: 'IČ DPH začína kódom krajiny (2 veľké písmená) a pokračuje 2 až 12 písmenami alebo číslicami, napríklad SK2020123456',
  postalCode: 'PSČ má mať presne 5 číslic',
  email: 'Zadajte e-mail v tvare meno@domena.sk',
} satisfies Record<FormatField, string>;
