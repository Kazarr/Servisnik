import { registrationCategories, registrationStatuses, type RegistrationFilter as Filter } from '@servisnik/domain/joy-ride';
import Link from 'next/link';
import { SelectField } from '../field.tsx';
import { registrationCategoryLabels, registrationStatusLabels } from './labels.ts';

/**
 * The filter of the list of Registrácií: a Kategória and a Stav. It is a form that goes to the list by GET, so the filter is in the address
 * and a reload or a shared link keeps it.
 */
export function RegistrationFilter({ filter }: { filter: Filter }) {
  return (
    <form role="search" action="/jazda-radosti" className="search">
      <SelectField label="Kategória" name="kategoria" defaultValue={filter.category ?? ''}>
        <option value="">Všetky</option>
        {registrationCategories.map((category) => (
          <option key={category} value={category}>
            {registrationCategoryLabels[category]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Stav" name="stav" defaultValue={filter.status ?? ''}>
        <option value="">Všetky</option>
        {registrationStatuses.map((status) => (
          <option key={status} value={status}>
            {registrationStatusLabels[status]}
          </option>
        ))}
      </SelectField>
      <button type="submit">Filtrovať</button>
      {(filter.category || filter.status) && <Link href="/jazda-radosti">Zrušiť filter</Link>}
    </form>
  );
}
