import { isDefaultListFilter, statusFilters, type ListFilter } from '@servisnik/domain/work-order';
import Link from 'next/link';
import { Field, SelectField } from '../field.tsx';
import { statusFilterLabels } from './status-labels.ts';

/**
 * The filter of the list of Zákazky: a status and the days of intake from and to. It is a form that goes
 * to the list by GET, so the filter is in the address (list-href.ts) and a reload or a shared link keeps it.
 */
export function WorkOrderFilter({ filter }: { filter: ListFilter }) {
  return (
    <form role="search" action="/zakazky" className="search">
      <SelectField label="Stav" name="stav" defaultValue={filter.status}>
        {statusFilters.map((status) => (
          <option key={status} value={status}>
            {statusFilterLabels[status]}
          </option>
        ))}
      </SelectField>
      <Field label="Prijaté od" name="od" type="date" defaultValue={filter.from ?? ''} />
      <Field label="Prijaté do" name="do" type="date" defaultValue={filter.to ?? ''} />
      <button type="submit">Filtrovať</button>
      {!isDefaultListFilter(filter) && <Link href="/zakazky">Zrušiť filter</Link>}
    </form>
  );
}
