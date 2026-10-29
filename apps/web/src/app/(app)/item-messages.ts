import type { ItemErrors } from '@servisnik/domain/work-order';

const markupMessages = {
  invalid: 'Prirážka musí byť číslo od -100, najviac na 1 desatinné miesto',
  disagrees: 'Prirážka nesedí s cenami. Upravte prirážku alebo predajnú cenu',
};

/**
 * What a form tells the admin about the fields of an item (a Položka zákazky or a Položka cenníka) the domain refused,
 * each message at its field. A reason the domain did not give is no message, so one function serves the form that has
 * a quantity and the form that has none.
 */
export const itemMessages = (errors: ItemErrors) => ({
  name: errors.name && 'Vyplňte názov',
  quantity: errors.quantity && 'Množstvo musí byť väčšie ako 0, najviac na 2 desatinné miesta',
  unit: errors.unit && 'Vyplňte jednotku',
  purchasePrice: errors.purchasePrice && 'Nákupná cena musí byť 0 alebo viac, najviac na 2 desatinné miesta',
  markup: errors.markup && markupMessages[errors.markup],
  unitPrice: errors.unitPrice && 'Cena musí byť 0 alebo viac, najviac na 2 desatinné miesta',
  vatRate: errors.vatRate && 'Vyberte sadzbu DPH zo sadzieb v Nastaveniach',
});

/** The messages of a form of an item by the field they belong at, so a form types its errors by this and not by a list of its own. */
export type ItemMessages = Partial<ReturnType<typeof itemMessages>>;
