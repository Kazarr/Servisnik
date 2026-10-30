import { expect, test } from 'vitest';
import { appCss } from './support/css-tokens.ts';

// A notice (.notice: what the admin should know, e.g. kilometres lower than the Stav km of the Vozidlo) is no error (.error:
// why a value or a form was refused). They must look different, and `.notice` was once two rules, the second of which gave
// every notice the red bar of an error. The look is the CSS, so it is read from globals.css.

const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector is exactly `selector`; the shared list of the gloss is another rule. */
const rulesOf = (selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, found]) => found!.trim() === selector).map(([, , body]) => body!);

test('.notice is one rule, so that nothing later in the file can add to it', () => {
  expect(rulesOf('.notice')).toHaveLength(1);
});

test('a notice is marked by the warning colour and takes nothing of the danger colour, which an error has', () => {
  const [notice] = rulesOf('.notice');

  expect(notice).toMatch(/border-left:[^;]*var\(--color-warning\)/);
  expect(notice).not.toContain('--color-danger');
  expect(rulesOf('.error').join()).toContain('var(--color-danger)');
});
