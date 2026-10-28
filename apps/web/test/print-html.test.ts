import { expect, test } from 'vitest';
import { html } from '../src/print/html.ts';

// The forms are HTML built in a Route Handler, where Next refuses react-dom/server; `html` is a template that
// escapes every value it is given, so that no text of a customer can become markup.

test('a text value is escaped: markup, ampersands and both kinds of quotes', () => {
  expect(html`<p>${`<b>"Ján" & 'Ema'</b>`}</p>`.text).toBe('<p>&lt;b&gt;&quot;Ján&quot; &amp; &#39;Ema&#39;&lt;/b&gt;</p>');
});

test('html inside html is not escaped again, and a text that looks like it is', () => {
  const inner = html`<b>${'a & b'}</b>`;

  expect(html`<p>${inner}</p>`.text).toBe('<p><b>a &amp; b</b></p>');
  expect(html`<p>${inner.text}</p>`.text).toBe('<p>&lt;b&gt;a &amp;amp; b&lt;/b&gt;</p>');
});

test('a number prints as itself, a list as its items one after another, and null, undefined, false and an empty list as nothing', () => {
  expect(html`<p>${123456}</p>`.text).toBe('<p>123456</p>');
  expect(html`<ul>${['a', html`<li>b</li>`, 3]}</ul>`.text).toBe('<ul>a<li>b</li>3</ul>');
  expect(html`<p>${null}${undefined}${false}${[]}</p>`.text).toBe('<p></p>');
});

test('0 and the empty text print as they are: only the absence of a value prints nothing', () => {
  expect(html`<p>${0}|${''}</p>`.text).toBe('<p>0|</p>');
});
