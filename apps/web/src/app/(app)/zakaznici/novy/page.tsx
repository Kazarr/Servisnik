import type { Metadata } from 'next';
import { currentUser } from '../../../../dal/current-user.ts';
import { CustomerForm } from './customer-form.tsx';

export const metadata: Metadata = { title: 'Nový zákazník' };

export default async function NewCustomerPage() {
  await currentUser();
  return (
    <>
      <h1>Nový zákazník</h1>
      <CustomerForm />
    </>
  );
}
