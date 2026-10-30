import type { Metadata } from 'next';
import { readLogoVersion } from '../../dal/branding.ts';
import { PoweredBy } from '../powered-by.tsx';
import { LoginForm } from './login-form.tsx';

export const metadata: Metadata = { title: 'Prihlásenie' };

// The logo comes from the database, so the page is made for each visit, not once at the build.
export const dynamic = 'force-dynamic';

/** What the demo customer stands for, under its logo. The words are theirs (ticket #150); a setting of Nastavenia comes with the themes per autoservis. */
const slogan = 'Kvalita nepozná kompromis';

export default async function LoginPage() {
  const logoVersion = await readLogoVersion();
  return (
    <main className="login">
      {logoVersion !== null && (
        <div className="login-brand">
          {/* The time of the change is in the address, so that a replaced logo is not shown from the browser's cache. */}
          <img className="login-logo" src={`/api/logo?v=${logoVersion}`} alt="Logo autoservisu" />
          <p className="login-slogan">{slogan}</p>
        </div>
      )}
      <h1>Prihlásenie</h1>
      <LoginForm />
      <PoweredBy />
    </main>
  );
}
