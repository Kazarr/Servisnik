// Print area (GLOSSARY: Tlačivá a import). Pure rules: no framework, database or network.

/** The words of a form in its file name, e.g. `Z2026-0001-zakazkovy-list.pdf`; a form is added here, with its test. */
const fileSlugs = { jobSheet: 'zakazkovy-list', quote: 'cenova-ponuka', handoverProtocol: 'odovzdavaci-protokol' } as const;

/** Zákazkový list (`jobSheet`), Cenová ponuka (`quote`) and Odovzdávací protokol (`handoverProtocol`), the three forms of the Tlačivá. */
export type PrintForm = keyof typeof fileSlugs;

/** The name a form is downloaded as: the number of its Zákazka, the form and `.pdf`. */
export const printFileName = (workOrderNumber: string, form: PrintForm): string => `${workOrderNumber}-${fileSlugs[form]}.pdf`;

/** The Hlavička tlačív: the top of every form is white (Biela) or a black bar (Čierny pruh). The admin picks one for all the forms. */
export const letterheads = ['white', 'blackBar'] as const;
export type Letterhead = (typeof letterheads)[number];

/** What a form prints with until the admin picks the other. */
export const defaultLetterhead: Letterhead = 'white';

/** The Hlavička a form sent, or null when what it sent is none of `letterheads`. */
export const parseLetterhead = (value: string): Letterhead | null => letterheads.find((letterhead) => letterhead === value) ?? null;
