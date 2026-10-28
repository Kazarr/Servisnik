// Print area (GLOSSARY: Tlačivá a import). Pure rules: no framework, database or network.

/** The words of a form in its file name, e.g. `Z2026-0001-zakazkovy-list.pdf`; a form is added here, with its test. */
const fileSlugs = { jobSheet: 'zakazkovy-list', quote: 'cenova-ponuka', handoverProtocol: 'odovzdavaci-protokol' } as const;

/** Zákazkový list (`jobSheet`), Cenová ponuka (`quote`) and Odovzdávací protokol (`handoverProtocol`), the three forms of the Tlačivá. */
export type PrintForm = keyof typeof fileSlugs;

/** The name a form is downloaded as: the number of its Zákazka, the form and `.pdf`. */
export const printFileName = (workOrderNumber: string, form: PrintForm): string => `${workOrderNumber}-${fileSlugs[form]}.pdf`;
