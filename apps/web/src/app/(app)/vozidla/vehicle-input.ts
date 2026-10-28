import { firstVehicleYear, lastVehicleYear, maxMileageKm } from '@servisnik/domain/vehicle';
import { localYear } from '@servisnik/domain/work-order';
import type { VehicleSaveErrors } from '../../../dal/vehicles.ts';
import { formatWhole } from '../../../format.ts';

// What a form of a Vozidlo sends and what it is told back: shared by the form of a new Vozidlo, the one that
// edits it, and the intake that saves a new Vozidlo with its Zákazka (zakazky/actions.ts).
// Not a 'use server' file: those export nothing but Server Actions.

export const vehicleFields = ['vin', 'licensePlate', 'make', 'model', 'year', 'fuel', 'mileageKm', 'note'] as const;
export type VehicleField = (typeof vehicleFields)[number];
export type VehicleFormValues = Record<VehicleField, string>;
export type VehicleFormErrors = Partial<Record<VehicleField, string>>;

/** The prefix of the names of the fields of a Vozidlo in the form of an intake, where the fields of a Zákazník may be in the same form. */
export const intakeVehiclePrefix = 'vehicle.';

const vinMessages = {
  length: 'VIN musí mať presne 17 znakov',
  characters: 'VIN smie obsahovať len písmená A–Z a číslice 0–9',
  confusable: 'VIN nemá písmená I, O ani Q: namiesto I patrí 1, namiesto O a Q patrí 0',
  taken: 'Vozidlo s týmto VIN už existuje',
};

/** The fields of a Vozidlo from a form whose field names start with `prefix`. */
export function readVehicle(formData: FormData, prefix = ''): VehicleFormValues {
  return Object.fromEntries(vehicleFields.map((name) => [name, String(formData.get(`${prefix}${name}`) ?? '')])) as VehicleFormValues;
}

/** The message of each field the domain or the database refused. */
export function vehicleMessages({ vin, make, model, year, fuel, mileageKm }: VehicleSaveErrors): VehicleFormErrors {
  return {
    vin: vin && vinMessages[vin],
    make: make && 'Vyplňte značku',
    model: model && 'Vyplňte model',
    year: year && `Rok výroby má byť od ${firstVehicleYear} do ${lastVehicleYear(localYear(new Date()))}`,
    fuel: fuel && 'Vyberte palivo zo zoznamu',
    mileageKm: mileageKm && `Stav km má byť celé číslo od 0 do ${formatWhole(maxMileageKm)}`,
  };
}
