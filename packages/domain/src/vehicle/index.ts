// Vehicle area (GLOSSARY: Zákazníci a vozidlá). Pure rules: no framework, database or network.

/** `confusable`: an I, O or Q, which a VIN never has (1 is meant by I, 0 by O and Q); `characters`: anything else but A-Z and 0-9. */
export type VinError = 'length' | 'characters' | 'confusable';

/** The VIN as Servisník stores it: capitals, no spaces or hyphens, 17 characters of A-Z and 0-9 without I, O and Q. */
export function parseVin(typed: string): { ok: true; vin: string } | { ok: false; error: VinError } {
  const stripped = typed.replace(/[\s-]/g, '');
  // Checked on what was typed: toUpperCase would turn a letter such as ſ into a plain S.
  if (/[IOQioq]/.test(stripped)) return { ok: false, error: 'confusable' };
  if (!/^[A-Za-z0-9]*$/.test(stripped)) return { ok: false, error: 'characters' };
  if (stripped.length !== 17) return { ok: false, error: 'length' };
  return { ok: true, vin: stripped.toUpperCase() };
}

/** The ŠPZ as Servisník stores it: capitals, no spaces or hyphens; null when nothing is left. It is no key: two vehicles may have the same one. */
export function parseLicensePlate(typed: string): string | null {
  return typed.replace(/[\s-]/g, '').toUpperCase() || null;
}

/** The fuels of a vehicle: benzín, nafta, hybrid, elektro, LPG, CNG and iné. */
export const fuels = ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'cng', 'other'] as const;
export type Fuel = (typeof fuels)[number];

/** The years of manufacture run from 1950 to the year after the current one (a model of next year is sold this year). */
export const firstVehicleYear = 1950;
export const lastVehicleYear = (currentYear: number) => currentYear + 1;

// Keeps the kilometres inside a PostgreSQL integer.
const maxMileageKm = 9_999_999;

export type VehicleInput = {
  vin: string;
  licensePlate: string;
  make: string;
  model: string;
  year?: string;
  /** One of `fuels`, or blank. */
  fuel?: string;
  /** The last known state of the odometer; spaces may group the digits. */
  mileageKm?: string;
  note?: string;
};
export type VehicleErrors = {
  vin?: VinError;
  make?: 'required';
  model?: 'required';
  year?: 'invalid';
  fuel?: 'invalid';
  mileageKm?: 'invalid';
};
export type Vehicle = {
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  fuel: Fuel | null;
  mileageKm: number | null;
  note: string | null;
};

/**
 * A Vozidlo ready to store, or every reason it is not one. VIN, make and model are required, the rest
 * is not. `currentYear` bounds the year of manufacture, so the rules stay free of the clock.
 */
export function parseVehicle(input: VehicleInput, currentYear: number): { ok: true; vehicle: Vehicle } | { ok: false; errors: VehicleErrors } {
  const vin = parseVin(input.vin);
  const make = input.make.trim();
  const model = input.model.trim();
  const year = input.year?.trim() ?? '';
  const fuel = input.fuel ?? '';
  const mileageKm = (input.mileageKm ?? '').replace(/\s/g, '');

  const errors: VehicleErrors = {};
  if (!vin.ok) errors.vin = vin.error;
  if (!make) errors.make = 'required';
  if (!model) errors.model = 'required';
  if (year && !(/^\d{4}$/.test(year) && Number(year) >= firstVehicleYear && Number(year) <= lastVehicleYear(currentYear))) errors.year = 'invalid';
  if (fuel && !(fuels as readonly string[]).includes(fuel)) errors.fuel = 'invalid';
  if (mileageKm && !(/^\d{1,7}$/.test(mileageKm) && Number(mileageKm) <= maxMileageKm)) errors.mileageKm = 'invalid';
  if (!vin.ok || Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    vehicle: {
      vin: vin.vin,
      licensePlate: parseLicensePlate(input.licensePlate),
      make,
      model,
      year: year ? Number(year) : null,
      fuel: (fuel as Fuel) || null,
      mileageKm: mileageKm ? Number(mileageKm) : null,
      note: input.note?.trim() || null,
    },
  };
}
