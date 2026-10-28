import type { Metadata } from 'next';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { CustomerForm } from './customer-form.tsx';

export const metadata: Metadata = { title: 'Nový zákazník' };

export default async function NewCustomerPage() {
  await currentUserWith('customers.write');
  return (
    <>
      <h1>Nový zákazník</h1>
      <CustomerForm />
    </>
  );
}
