/** What the form for a new Používateľ shows again after a send. The password is not among them: it is never sent back. */
export type UserFormValues = { name: string; email: string; role: string };

/** The form's values when it is empty: a Používateľ is a mechanik unless the admin says otherwise, the least privilege. */
export const emptyUserForm: UserFormValues = { name: '', email: '', role: 'mechanik' };
