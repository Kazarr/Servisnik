import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import type { ReactNode } from 'react';
import { productName } from '../product.ts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: productName, template: `%s – ${productName}` },
};

// Outfit, the font of the customer's site, in the weights of the theme (--font-weight-* in globals.css: 400 text, 600 medium, 800
// bold). `next build` downloads it and serves it from the app, so no page asks Google for it. The two subsets carry the Slovak
// letters: latin has á, í, ô, latin-ext has č, š, ž, ľ, ť, ň. `--font-family` of globals.css names it through the variable, which
// this class sets on <html>. The global error page replaces this layout and test/error-pages.test.ts renders it without Next, so it
// has no Outfit and falls back to the system font.
const outfit = Outfit({ subsets: ['latin', 'latin-ext'], weight: ['400', '600', '800'], variable: '--font-outfit' });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sk" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
