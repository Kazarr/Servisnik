import { amountsOf, totalsOf, type Priced } from '@servisnik/domain/work-order';
import { asc } from 'drizzle-orm';
import { workOrderItem } from '../db/schema.ts';

// What the detail of a Zákazka (work-orders.ts) and the forms of it (print-forms.ts) share about its items, so that
// the cenová ponuka and the detail cannot show different amounts. It asks no capability: the read that calls it does.

/** The items of a Zákazka in the order they were added; `id` breaks the tie of two added in the same instant. */
export const inOrderAdded = [asc(workOrderItem.createdAt), asc(workOrderItem.id)];

/** `items`, each with its `amounts`, and the `totals` of the Zákazka: all of them the domain's (`amountsOf`, `totalsOf`), so nothing is added up here. */
export const withAmounts = <Item extends Priced>(items: readonly Item[]) => ({
  items: items.map((item) => ({ ...item, amounts: amountsOf(item) })),
  totals: totalsOf(items),
});
