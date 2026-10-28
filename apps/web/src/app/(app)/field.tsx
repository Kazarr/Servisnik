import type { ComponentProps, ReactNode } from 'react';

type Common = { label: string; name: string; error?: string };

/** The reason a whole form was refused, above its fields. */
export function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="error">
      {message}
    </p>
  ) : null;
}

/** A label above a control, and below it the reason the value was refused, tied to the control so a screen reader reads both. */
function Shell({ label, name, error, children }: Common & { children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {error && (
        <p id={`${name}-error`} role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, error?: string) => ({
  id: name,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${name}-error` : undefined,
});

/** A labelled input with the reason it was refused tied to it, so a screen reader reads both. */
export function Field({ label, error, ...input }: Common & ComponentProps<'input'>) {
  return (
    <Shell label={label} name={input.name} error={error}>
      <input {...describedBy(input.name, error)} {...input} />
    </Shell>
  );
}

/** Like Field, for text that runs over several lines. */
export function TextAreaField({ label, error, ...textarea }: Common & ComponentProps<'textarea'>) {
  return (
    <Shell label={label} name={textarea.name} error={error}>
      <textarea {...describedBy(textarea.name, error)} {...textarea} />
    </Shell>
  );
}

/** Like Field, for a choice from `children` (the options). */
export function SelectField({ label, error, ...select }: Common & ComponentProps<'select'>) {
  return (
    <Shell label={label} name={select.name} error={error}>
      <select {...describedBy(select.name, error)} {...select} />
    </Shell>
  );
}
