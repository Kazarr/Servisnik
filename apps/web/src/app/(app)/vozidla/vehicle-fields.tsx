import { fuels } from '@servisnik/domain/vehicle';
import Link from 'next/link';
import type { ExistingVehicle } from '../../../dal/vehicles.ts';
import { Field, SelectField, TextAreaField } from '../field.tsx';
import { fuelLabels } from './fuel-labels.ts';
import type { VehicleFormErrors, VehicleField } from './vehicle-input.ts';

/**
 * The fields of a Vozidlo. `value` is what a field starts with and `errors` the reason a field was
 * refused; a VIN that is taken links to the Vozidlo that has it and to its Majiteľ.
 */
export function VehicleFields({
  value,
  errors,
  existing,
}: {
  value: (name: VehicleField) => string;
  errors: VehicleFormErrors;
  existing?: ExistingVehicle;
}) {
  const taken = existing && (
    <>
      {errors.vin}: <Link href={`/vozidla/${existing.id}`}>{existing.make} {existing.model}</Link>, majiteľ{' '}
      <Link href={`/zakaznici/${existing.owner.id}`}>{existing.owner.name}</Link>
    </>
  );

  return (
    <>
      <Field label="VIN" name="vin" defaultValue={value('vin')} error={taken || errors.vin} autoComplete="off" required />
      <Field label="ŠPZ" name="licensePlate" defaultValue={value('licensePlate')} autoComplete="off" />
      <Field label="Značka" name="make" defaultValue={value('make')} error={errors.make} required />
      <Field label="Model" name="model" defaultValue={value('model')} error={errors.model} required />
      <Field label="Rok výroby" name="year" defaultValue={value('year')} error={errors.year} inputMode="numeric" autoComplete="off" />
      <SelectField label="Palivo" name="fuel" defaultValue={value('fuel')} error={errors.fuel}>
        <option value="">—</option>
        {fuels.map((fuel) => (
          <option key={fuel} value={fuel}>
            {fuelLabels[fuel]}
          </option>
        ))}
      </SelectField>
      <Field label="Stav km" name="mileageKm" defaultValue={value('mileageKm')} error={errors.mileageKm} inputMode="numeric" autoComplete="off" />
      <TextAreaField label="Poznámka" name="note" defaultValue={value('note')} />
    </>
  );
}
