import { productName } from '../product.ts';

/** The product under the logo of the autoservis, quietly: on the login page and at the bottom of the menu. */
export function PoweredBy() {
  return <p className="powered-by">{`powered by ${productName}`}</p>;
}
