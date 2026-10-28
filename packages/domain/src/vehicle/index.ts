// Vehicle area (GLOSSARY: Vozidlá). Pure rules: no framework, database or network.

export type VinError = 'length' | 'characters';

/** The VIN as Servisník stores it: capitals, no spaces or hyphens, 17 characters of A-Z and 0-9 without I, O and Q. */
export function parseVin(typed: string): { ok: true; vin: string } | { ok: false; error: VinError } {
  const stripped = typed.replace(/[\s-]/g, '');
  // Checked on what was typed: toUpperCase would turn a letter such as ſ into a plain S.
  if (!/^[A-HJ-NPR-Za-hj-npr-z0-9]*$/.test(stripped)) return { ok: false, error: 'characters' };
  if (stripped.length !== 17) return { ok: false, error: 'length' };
  return { ok: true, vin: stripped.toUpperCase() };
}

export type VehicleInput = { vin: string; licensePlate: string; make: string; model: string };
export type VehicleErrors = { vin?: VinError; make?: 'required'; model?: 'required' };
export type Vehicle = { vin: string; licensePlate: string | null; make: string; model: string };

/** A Vozidlo ready to store, or every reason it is not one. VIN, make and model are required, the ŠPZ is not. */
export function parseVehicle(input: VehicleInput): { ok: true; vehicle: Vehicle } | { ok: false; errors: VehicleErrors } {
  const vin = parseVin(input.vin);
  const make = input.make.trim();
  const model = input.model.trim();
  if (!vin.ok || !make || !model) {
    const errors: VehicleErrors = {};
    if (!vin.ok) errors.vin = vin.error;
    if (!make) errors.make = 'required';
    if (!model) errors.model = 'required';
    return { ok: false, errors };
  }
  return { ok: true, vehicle: { vin: vin.vin, licensePlate: input.licensePlate.trim() || null, make, model } };
}
