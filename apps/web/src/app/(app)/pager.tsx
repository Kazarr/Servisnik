import Link from 'next/link';

/** Links to the previous and the next page of a list, nothing when the list has one page. `href` is the address of page n. */
export function Pager({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Stránkovanie" className="pager">
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev">
          Predchádzajúca
        </Link>
      )}
      <span>
        Strana {page} z {pageCount}
      </span>
      {page < pageCount && (
        <Link href={href(page + 1)} rel="next">
          Nasledujúca
        </Link>
      )}
    </nav>
  );
}
