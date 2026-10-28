import type { ComponentProps, ReactNode } from 'react';

/** What every kind of field takes besides the props of its own control. */
type FieldProps = { label: string; name: string; error?: ReactNode };

/** The reason a whole form was refused, above its fields. */
export function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="error">
      {message}
    </p>
  ) : null;
}

/** A label above a control, and below it the reason the value was refused, tied to the control so a screen reader reads both. */
function FieldFrame({ label, name, error, children }: FieldProps & { children: ReactNode }) {
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

/** What a control gets from its frame: the `id` the label points at, and the marks that tie it to its error. */
const controlAttributes = (name: string, error?: ReactNode) => ({
  id: name,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${name}-error` : undefined,
});

/** A labelled input with the reason it was refused tied to it, so a screen reader reads both. */
export function Field({ label, error, ...input }: FieldProps & ComponentProps<'input'>) {
  return (
    <FieldFrame label={label} name={input.name} error={error}>
      <input {...controlAttributes(input.name, error)} {...input} />
    </FieldFrame>
  );
}

/** Like Field, for text that runs over several lines. */
export function TextAreaField({ label, error, ...textarea }: FieldProps & ComponentProps<'textarea'>) {
  return (
    <FieldFrame label={label} name={textarea.name} error={error}>
      <textarea {...controlAttributes(textarea.name, error)} {...textarea} />
    </FieldFrame>
  );
}

/** Like Field, for a choice from `children` (the options). */
export function SelectField({ label, error, ...select }: FieldProps & ComponentProps<'select'>) {
  return (
    <FieldFrame label={label} name={select.name} error={error}>
      <select {...controlAttributes(select.name, error)} {...select} />
    </FieldFrame>
  );
}
