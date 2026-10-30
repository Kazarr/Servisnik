import Link from 'next/link';
import { productName } from '../product.ts';

/** An unknown address, or a page that called notFound(). Lives at the root so that both reach it. */
export default function NotFound() {
  return (
    <main className="content">
      <h1>Stránka sa nenašla</h1>
      <p>{`Takú adresu ${productName} nepozná.`}</p>
      <Link href="/zakazky" className="button">
        Späť na zákazky
      </Link>
    </main>
  );
}
