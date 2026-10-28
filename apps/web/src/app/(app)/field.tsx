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
function FieldFrame({ label, id, error, children }: { label: string; id: string; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

/** What a control gets from its frame: the `id` the label points at, and the marks that tie it to its error. */
const controlAttributes = (id: string, error?: ReactNode) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
});

/**
 * A labelled input with the reason it was refused tied to it, so a screen reader reads both. The `id` is the
 * name unless one is given, which a page needs when two forms on it have a field of the same name.
 */
export function Field({ label, error, ...input }: FieldProps & ComponentProps<'input'>) {
  const id = input.id ?? input.name;
  return (
    <FieldFrame label={label} id={id} error={error}>
      <input {...controlAttributes(id, error)} {...input} />
    </FieldFrame>
  );
}

/** Like Field, for text that runs over several lines. */
export function TextAreaField({ label, error, ...textarea }: FieldProps & ComponentProps<'textarea'>) {
  const id = textarea.id ?? textarea.name;
  return (
    <FieldFrame label={label} id={id} error={error}>
      <textarea {...controlAttributes(id, error)} {...textarea} />
    </FieldFrame>
  );
}

/** Like Field, for a choice from `children` (the options). */
export function SelectField({ label, error, ...select }: FieldProps & ComponentProps<'select'>) {
  const id = select.id ?? select.name;
  return (
    <FieldFrame label={label} id={id} error={error}>
      <select {...controlAttributes(id, error)} {...select} />
    </FieldFrame>
  );
}
