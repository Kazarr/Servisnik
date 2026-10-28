import { getLogoInfo } from '../../../dal/logo.ts';
import type { User } from '../../../dal/user.ts';
import { formatWhole } from '../../../format.ts';
import { LogoForm } from './logo-form.tsx';

const typeNames = { 'image/png': 'PNG', 'image/jpeg': 'JPEG' };

/** Logo: the preview of the logo of the autoservis with its type and size, and the form to replace or remove it. */
export async function LogoSection({ user }: { user: User }) {
  const logo = await getLogoInfo(user);
  return (
    <section aria-labelledby="logo-heading" className="settings-section">
      <h2 id="logo-heading">Logo</h2>
      {logo && (
        <figure className="logo-preview">
          {/* The time of the change is in the address, so that a replaced logo is not shown from the browser's cache. */}
          <img src={`/api/logo?v=${logo.updatedAt.getTime()}`} alt="Logo autoservisu" />
          <figcaption>
            {typeNames[logo.contentType]}, {formatWhole(logo.sizeBytes)} B
          </figcaption>
        </figure>
      )}
      <LogoForm hasLogo={logo !== null} />
    </section>
  );
}
