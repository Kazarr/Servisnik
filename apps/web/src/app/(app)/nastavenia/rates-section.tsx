import { getRates } from '../../../dal/settings.ts';
import type { User } from '../../../dal/user.ts';
import { RatesForm } from './rates-form.tsx';
import { ratesToFields } from './rates-fields.ts';

/** Sadzby: the VAT rates with the default one, the hourly rate and the markup on parts. */
export async function RatesSection({ user }: { user: User }) {
  const rates = await getRates(user);
  return (
    <section aria-labelledby="rates-heading" className="settings-section">
      <h2 id="rates-heading">Sadzby</h2>
      <RatesForm initial={ratesToFields(rates)} />
    </section>
  );
}
