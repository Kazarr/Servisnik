import Link from 'next/link';
import { formatWhole } from '../../../../format.ts';

/**
 * What the admin is told when a Zákazka was saved with kilometres lower than the Stav km of its Vozidlo:
 * that it was saved, and that the Stav km stay as they were (the odometer may have been replaced).
 */
export function LowerMileageNotice({ id, number, vehicleMileageKm }: { id: string; number: string; vehicleMileageKm: number }) {
  return (
    <div role="status" className="notice">
      <p>
        Zákazka <Link href={`/zakazky/${id}`}>{number}</Link> je uložená.
      </p>
      <p>
        Upozornenie: kilometre pri príjme sú nižšie ako stav km vozidla ({formatWhole(vehicleMileageKm)} km), stav km vozidla sa nezmenil.
      </p>
    </div>
  );
}
