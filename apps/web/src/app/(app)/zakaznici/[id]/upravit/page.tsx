import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getCustomer } from '../../../../../dal/customers.ts';
import { editCustomer } from '../../actions.ts';
import { CustomerForm } from '../../customer-form.tsx';

export const metadata: Metadata = { title: 'Upraviť zákazníka' };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const customer = await getCustomer(await currentUserWith('customers.write'), (await params).id);
  if (!customer) notFound();

  const { id, type, name, ico, dic, icDph, street, city, postalCode, phone, email, note } = customer;
  return (
    <>
      <h1>Upraviť zákazníka</h1>
      <CustomerForm action={editCustomer} customer={{ id, type, name, ico, dic, icDph, street, city, postalCode, phone, email, note }} />
    </>
  );
}
