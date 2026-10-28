import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getCustomer } from '../../../../../dal/customers.ts';
import { first, pageOf } from '../../../search-params.ts';
import { OwnerSearch } from '../../../vozidla/owner-search.tsx';
import { intakePaths } from '../paths.ts';
import { IntakeForm } from './intake-form.tsx';

export const metadata: Metadata = { title: 'Nové vozidlo a zákazka' };

const title = 'Nové vozidlo a zákazka';

/**
 * An intake with a new Vozidlo. `?zakaznik=<id>` names the Zákazník who is its Majiteľ, `?novy=zakaznik`
 * says he is a new one and the form asks for him too; without either, the Majiteľ is searched for.
 */
export default async function NewVehicleIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ zakaznik?: string | string[]; novy?: string | string[]; q?: string | string[]; strana?: string | string[] }>;
}) {
  const user = await currentUserWith('work-orders.write');
  const { zakaznik, novy, q, strana } = await searchParams;

  if (novy === 'zakaznik') {
    return (
      <>
        <h1>{title}</h1>
        <p>
          Majiteľ: <strong>nový zákazník</strong> · <Link href={intakePaths.newVehicle}>Vybrať existujúceho</Link>
        </p>
        <IntakeForm />
      </>
    );
  }
  if (zakaznik === undefined) {
    return (
      <>
        <h1>{title}</h1>
        <p>
          <Link href={intakePaths.withNewOwner} className="button">
            Nový zákazník
          </Link>
        </p>
        <OwnerSearch user={user} query={first(q)} page={pageOf(strana)} path={intakePaths.newVehicle} />
      </>
    );
  }

  const owner = typeof zakaznik === 'string' ? await getCustomer(user, zakaznik) : null;
  if (!owner) notFound();
  return (
    <>
      <h1>{title}</h1>
      <p>
        Majiteľ: <strong>{owner.name}</strong> · <Link href={intakePaths.newVehicle}>Zmeniť majiteľa</Link>
      </p>
      <IntakeForm ownerId={owner.id} />
    </>
  );
}
