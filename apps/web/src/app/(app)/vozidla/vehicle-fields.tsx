import { fuels } from '@servisnik/domain/vehicle';
import Link from 'next/link';
import type { ExistingVehicle } from '../../../dal/vehicles.ts';
import { Field, SelectField, TextAreaField } from '../field.tsx';
import { intakePaths } from '../zakazky/nova/paths.ts';
import { fuelLabels } from './fuel-labels.ts';
import { intakeVehiclePrefix, type VehicleField, type VehicleFormErrors } from './vehicle-input.ts';

/**
 * The fields of a Vozidlo. `value` is what a field starts with and `errors` the reason a field was
 * refused. A VIN that is taken links to the Vozidlo that has it and to its Majiteľ; with `intake` (the
 * fields are then named under `intakeVehiclePrefix`) the link starts a Zákazka on that Vozidlo, and
 * there is no Stav km, because the kilometres at intake are it.
 */
export function VehicleFields({
  value,
  errors,
  existing,
  intake = false,
}: {
  value: (name: VehicleField) => string;
  errors: VehicleFormErrors;
  existing?: ExistingVehicle;
  intake?: boolean;
}) {
  const named = (name: VehicleField) => (intake ? `${intakeVehiclePrefix}${name}` : name);
  const taken = existing && (
    <>
      {errors.vin}:{' '}
      {intake ? (
        <Link href={intakePaths.forVehicle(existing.id)}>
          Založiť zákazku na vozidle {existing.make} {existing.model}
        </Link>
      ) : (
        <Link href={`/vozidla/${existing.id}`}>
          {existing.make} {existing.model}
        </Link>
      )}
      , majiteľ <Link href={`/zakaznici/${existing.owner.id}`}>{existing.owner.name}</Link>
    </>
  );

  return (
    <>
      <Field label="VIN" name={named('vin')} defaultValue={value('vin')} error={taken || errors.vin} autoComplete="off" required />
      <Field label="ŠPZ" name={named('licensePlate')} defaultValue={value('licensePlate')} autoComplete="off" />
      <Field label="Značka" name={named('make')} defaultValue={value('make')} error={errors.make} required />
      <Field label="Model" name={named('model')} defaultValue={value('model')} error={errors.model} required />
      <Field label="Rok výroby" name={named('year')} defaultValue={value('year')} error={errors.year} inputMode="numeric" autoComplete="off" />
      <SelectField label="Palivo" name={named('fuel')} defaultValue={value('fuel')} error={errors.fuel}>
        <option value="">—</option>
        {fuels.map((fuel) => (
          <option key={fuel} value={fuel}>
            {fuelLabels[fuel]}
          </option>
        ))}
      </SelectField>
      {!intake && (
        <Field label="Stav km" name="mileageKm" defaultValue={value('mileageKm')} error={errors.mileageKm} inputMode="numeric" autoComplete="off" />
      )}
      <TextAreaField label="Poznámka" name={named('note')} defaultValue={value('note')} />
    </>
  );
}
