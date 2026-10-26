'use client';

import { useActionState } from 'react';
import { signIn } from './actions.ts';

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);
  return (
    <form action={formAction}>
      <label>
        E-mail
        <input name="email" type="email" autoComplete="username" defaultValue={state?.email} required />
      </label>
      <label>
        Heslo
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        Prihlásiť sa
      </button>
    </form>
  );
}
