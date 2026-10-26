import { redirect } from 'next/navigation';
import { currentUser } from '../../dal/current-user.ts';

export default async function HomePage() {
  await currentUser();
  redirect('/zakazky');
}
