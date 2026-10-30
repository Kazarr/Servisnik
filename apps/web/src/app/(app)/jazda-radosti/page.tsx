import { registrationStatuses } from '@servisnik/domain/joy-ride';
import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUserWith } from '../../../dal/current-user.ts';
import { getEdition, listRegistrations } from '../../../dal/joy-ride.ts';
import { formatDate } from '../../../format.ts';
import { first } from '../search-params.ts';
import { DecisionForm } from './decision-form.tsx';
import { registrationCategoryLabels, registrationCountLabels, registrationStatusLabels } from './labels.ts';
import { RegistrationFilter } from './registration-filter.tsx';

export const metadata: Metadata = { title: 'Jazda radosti' };

/** The uzávierka as the page shows it: the day, and the hour. */
const formatDeadline = (deadline: string) => `${formatDate(deadline.slice(0, 10))} ${deadline.slice(11)}`;

// ponytail: the list has no paging; the Ročník of 2026 had a few dozen exhibitors. Page it like the Cenník (pageWindow) if a Ročník outgrows a screen.
export default async function JoyRidePage({ searchParams }: { searchParams: Promise<{ kategoria?: string | string[]; stav?: string | string[] }> }) {
  const { kategoria, stav } = await searchParams;
  const user = await currentUserWith('joy-ride.read');
  const edition = await getEdition(user);
  const { filter, counts, registrations } = await listRegistrations(user, { category: first(kategoria), status: first(stav) });

  return (
    <>
      <div className="page-header">
        <h1>Jazda radosti</h1>
        <Link href="/jazda-radosti/rocnik" className="button">
          {edition ? 'Upraviť ročník' : 'Zadať ročník'}
        </Link>
      </div>
      {edition ? (
        <>
          <dl className="details">
            <div>
              <dt>Názov</dt>
              <dd>{edition.name}</dd>
            </div>
            <div>
              <dt>Dátum konania</dt>
              <dd>{formatDate(edition.date)}</dd>
            </div>
            <div>
              <dt>Miesto konania</dt>
              <dd>{edition.place}</dd>
            </div>
            <div>
              <dt>Uzávierka registrácií</dt>
              <dd>{formatDeadline(edition.registrationDeadline)}</dd>
            </div>
          </dl>

          <div className="page-header">
            <h2>Registrácie</h2>
            <Link href="/jazda-radosti/registracia/nova" className="button">
              Pridať registráciu
            </Link>
          </div>
          <dl className="details">
            {registrationStatuses.map((status) => (
              <div key={status}>
                <dt>{registrationCountLabels[status]}</dt>
                <dd>{counts[status]}</dd>
              </div>
            ))}
          </dl>
          <RegistrationFilter filter={filter} />
          {registrations.length === 0 ? (
            <p>{filter.category || filter.status ? 'Žiadna registrácia nezodpovedá filtru.' : 'Zatiaľ žiadna registrácia.'}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Meno</th>
                    <th scope="col">Kontakt</th>
                    <th scope="col">Vozidlo</th>
                    <th scope="col">Kategória</th>
                    <th scope="col">Stav</th>
                    <th scope="col">Dátum</th>
                    <th scope="col">Akcie</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((registration) => (
                    <tr key={registration.id}>
                      <td>{registration.name}</td>
                      <td>
                        {registration.phone}
                        <br />
                        {registration.email}
                      </td>
                      <td>
                        {registration.make} {registration.model}
                        {registration.licensePlate && ` (${registration.licensePlate})`}
                      </td>
                      <td>{registrationCategoryLabels[registration.category]}</td>
                      <td>{registrationStatusLabels[registration.status]}</td>
                      <td>{formatDate(registration.createdOn)}</td>
                      <td>
                        <div className="row-actions">
                          <Link href={`/jazda-radosti/registracia/${registration.id}/upravit`} aria-label={`Upraviť ${registration.name}`}>
                            Upraviť
                          </Link>
                          <DecisionForm registrationId={registration.id} name={registration.name} status={registration.status} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p>Ročník zatiaľ nie je zadaný. Zadajte ho a potom môžete evidovať registrácie.</p>
      )}
    </>
  );
}
