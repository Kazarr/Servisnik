/** The state of a Používateľ as the list and his page say it: Aktívny, or Deaktivovaný for a Deaktivovaný používateľ (`banned`). */
export const statusLabel = (banned: boolean) => (banned ? 'Deaktivovaný' : 'Aktívny');
