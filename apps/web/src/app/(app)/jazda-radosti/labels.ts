import type { RegistrationCategory, RegistrationStatus } from '@servisnik/domain/joy-ride';

export const registrationStatusLabels: Record<RegistrationStatus, string> = { new: 'Nová', approved: 'Schválená', rejected: 'Zamietnutá' };

/** What the counts above the list call the Registrácie in a Stav: "Nové 3", not "Nová 3". */
export const registrationCountLabels: Record<RegistrationStatus, string> = { new: 'Nové', approved: 'Schválené', rejected: 'Zamietnuté' };

export const registrationCategoryLabels: Record<RegistrationCategory, string> = {
  supersport: 'Superšport',
  interesting: 'Zaujímavé auto',
  heavy: 'Ťažká technika',
  veteran: 'Veterán',
  motorcycle: 'Motorka',
  other: 'Iné',
};
