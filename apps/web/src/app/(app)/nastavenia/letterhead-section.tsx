import { getLetterhead } from '../../../dal/workshop.ts';
import type { User } from '../../../dal/user.ts';
import { LetterheadForm } from './letterhead-form.tsx';

/** Tlačivá: how the header of every printed form looks, white or a black bar. */
export async function LetterheadSection({ user }: { user: User }) {
  const letterhead = await getLetterhead(user);
  return (
    <section aria-labelledby="letterhead-heading" className="settings-section">
      <h2 id="letterhead-heading">Tlačivá</h2>
      <LetterheadForm initial={letterhead} />
    </section>
  );
}
