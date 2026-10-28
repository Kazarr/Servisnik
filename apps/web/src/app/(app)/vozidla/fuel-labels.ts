import type { Fuel } from '@servisnik/domain/vehicle';

export const fuelLabels: Record<Fuel, string> = {
  petrol: 'Benzín',
  diesel: 'Nafta',
  hybrid: 'Hybrid',
  electric: 'Elektro',
  lpg: 'LPG',
  cng: 'CNG',
  other: 'Iné',
};
