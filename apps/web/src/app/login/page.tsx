import type { Metadata } from 'next';
import { LoginForm } from './login-form.tsx';

export const metadata: Metadata = { title: 'Prihlásenie' };

export default function LoginPage() {
  return (
    <main className="login">
      <h1>Prihlásenie</h1>
      <LoginForm />
    </main>
  );
}
