import { getWorkshopDetails } from '../../../dal/workshop.ts';
import type { User } from '../../../dal/user.ts';
import { WorkshopForm } from './workshop-form.tsx';

/** Údaje autoservisu: the name, address, IČO, DIČ, IČ DPH, platiteľ DPH, IBAN and contacts that go on the documents. */
export async function WorkshopSection({ user }: { user: User }) {
  const details = await getWorkshopDetails(user);
  return (
    <section aria-labelledby="workshop-heading" className="settings-section">
      <h2 id="workshop-heading">Údaje autoservisu</h2>
      <WorkshopForm details={details} />
    </section>
  );
}
