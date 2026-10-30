import { expect, test } from 'vitest';
import { appCss, COMMENT } from './support/css-tokens.ts';

// A notice (.notice: what the admin should know, e.g. kilometres lower than the Stav km of the Vozidlo) is no error (.error:
// why a value or a form was refused). They must look different: the notice has the warning bar, and no rule that names
// `.notice` sets the danger colour of an error. The look is the CSS, so it is read from globals.css.

const rulesOf = (css: string) =>
  [...css.replace(COMMENT, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector!.trim(), body: body! }));

/** What is wrong with the `.notice` of a CSS text, one word for each fault; none when it is one rule with the warning bar. */
const noticeFaults = (css: string) => {
  const rules = rulesOf(css);
  const own = rules.filter(({ selector }) => selector === '.notice');
  const body = own[0]?.body ?? '';
  const faults: string[] = [];
  // A selector list, a descendant, `div.notice` and a rule in a media query all name `.notice`; `.notice-x` and `.notices` do not.
  if (rules.some(({ selector, body }) => /\.notice(?![\w-])/.test(selector) && body.includes('--color-danger'))) faults.push('danger colour');
  if (own.length !== 1) faults.push('not one rule');
  if (!/border-left:[^;]*var\(--color-warning\)/.test(body)) faults.push('no warning bar');
  if (/border-left:[\s\S]*(?<![\w-])border:/.test(body)) faults.push('bar overridden'); // the shorthand after the bar resets it
  return faults;
};

const notice = '.notice { border: 1px solid var(--color-border); border-left: 4px solid var(--color-warning); }';

test('globals.css gives .notice the warning bar, in one rule, and no rule that names .notice sets a danger colour', () => {
  expect(noticeFaults(appCss)).toEqual([]);
});

test('an error is in the danger colour, which is what a notice is told from', () => {
  const error = rulesOf(appCss).filter(({ selector }) => selector === '.error');

  expect(error.map(({ body }) => body).join()).toContain('var(--color-danger)');
});

test('a .notice rule with the warning bar after its border has no fault', () => {
  expect(noticeFaults(notice)).toEqual([]);
});

test.each([
  ['a list of selectors', '.notice, .x { border-left-color: var(--color-danger); }'],
  ['a descendant', '.content .notice { border-left: 4px solid var(--color-danger); }'],
  ['an element with the class', 'div.notice { border-left-color: var(--color-danger); }'],
  ['a variant of the danger colour', '.x .notice { background: var(--color-danger-background); }'],
  ['a media query', '@media (min-width: 1px) { .notice { border-left-color: var(--color-danger); } }'],
])('a danger colour in %s is a fault', (_, rule) => {
  expect(noticeFaults(`${notice} ${rule}`)).toContain('danger colour');
});

test.each([
  ['.notice-x', '.notice-x { border-left-color: var(--color-danger); }'],
  ['.notices', '.notices, .x-notice { border-left-color: var(--color-danger); }'],
  ['a comment', '/* .notice { border-left-color: var(--color-danger); } */'],
])('a danger colour in %s is no fault, as it is no rule of .notice', (_, rule) => {
  expect(noticeFaults(`${notice} ${rule}`)).toEqual([]);
});

test('a second .notice rule is a fault, since the second is the one that decides', () => {
  expect(noticeFaults(`${notice} .notice { margin: 0; }`)).toEqual(['not one rule']);
});

test.each([
  ['no bar', '.notice { border: 1px solid var(--color-border); }'],
  ['a bar that is a variant of the warning colour', '.notice { border-left: 4px solid var(--color-warning-background); }'],
])('%s is a fault', (_, css) => {
  expect(noticeFaults(css)).toEqual(['no warning bar']);
});

test('the border shorthand after the bar is a fault; other border properties after it are not', () => {
  const bar = 'border-left: 4px solid var(--color-warning);';

  expect(noticeFaults(`.notice { ${bar} border: 1px solid var(--color-border); }`)).toEqual(['bar overridden']);
  expect(noticeFaults(`.notice { ${bar} border-top: 1px solid var(--color-border); border-radius: 2px; }`)).toEqual([]);
});
