import type { Metadata } from 'next';
import { currentUser } from '../../../../dal/current-user.ts';
import { assertAdmin } from '../../../../dal/user.ts';
import { addCustomer } from '../actions.ts';
import { CustomerForm } from '../customer-form.tsx';

export const metadata: Metadata = { title: 'Nový zákazník' };

export default async function NewCustomerPage() {
  assertAdmin(await currentUser()); // the form itself reads no data, so the DAL would not refuse a mechanik before the save
  return (
    <>
      <h1>Nový zákazník</h1>
      <CustomerForm action={addCustomer} />
    </>
  );
}
