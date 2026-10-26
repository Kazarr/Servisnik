import type { ComponentProps } from 'react';

/** A labelled input with the reason it was refused tied to it, so a screen reader reads both. */
export function Field({ label, error, ...input }: { label: string; error?: string } & ComponentProps<'input'> & { name: string }) {
  const errorId = `${input.name}-error`;
  return (
    <div className="field">
      <label htmlFor={input.name}>{label}</label>
      <input id={input.name} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...input} />
      {error && (
        <p id={errorId} role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
