import type { Metadata } from 'next';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { addCustomer } from '../actions.ts';
import { CustomerForm } from '../customer-form.tsx';

export const metadata: Metadata = { title: 'Nový zákazník' };

export default async function NewCustomerPage() {
  await currentUserWith('customers.write'); // the form itself reads no data, so the DAL would not refuse a mechanik before the save
  return (
    <>
      <h1>Nový zákazník</h1>
      <CustomerForm action={addCustomer} />
    </>
  );
}
