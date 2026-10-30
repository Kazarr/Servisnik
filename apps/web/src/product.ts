/**
 * The name the app is shown under: in the title of every page, in the menu of an autoservis without a logo, on the not-found page
 * and in the "powered by" line. It is the only place in the code that has it, so a new name from MG is one edit here, plus every
 * literal `git grep Garage24Hub apps/web` finds in the tests and the e2e specs. The icon of the app (app/icon.svg) carries its
 * short form, G24, as a file of its own.
 */
export const productName = 'Garage24Hub';
