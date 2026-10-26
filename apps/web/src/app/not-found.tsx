import Link from 'next/link';

/** An unknown address, or a page that called notFound(). Lives at the root so that both reach it. */
export default function NotFound() {
  return (
    <main className="content">
      <h1>Stránka sa nenašla</h1>
      <p>Takú adresu Servisník nepozná.</p>
      <Link href="/zakazky" className="button">
        Späť na zákazky
      </Link>
    </main>
  );
}
