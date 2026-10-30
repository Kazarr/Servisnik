import { createDb } from '../src/db/index.ts';
import { downloadLogo, seedDemo } from '../src/demo.ts';
import { readEnv } from '../src/env.ts';
import { printError } from '../src/print-error.ts';

// `pnpm db:demo`: fills the demo environment with the autoservis of the customer (the details of the register, the logo) and
// Zákazky on premium cars. Run by hand against the database of the demo, any number of times; no deploy runs it, and `db:seed` does not.
try {
  const { DATABASE_URL } = readEnv(process.env, ['DATABASE_URL']);
  const db = createDb(DATABASE_URL);
  const { created, existing, phoneMissing, logoSaved } = await seedDemo(db, { logo: await downloadLogo() });
  await db.$client.end();
  console.log(`Demo hotové: údaje autoservisu sú vyplnené, nových zákaziek ${created}, už tam boli ${existing}.`);
  if (!logoSaved) console.log('Logo sa nepodarilo stiahnuť. Nahrajte ho v Nastaveniach → Logo.');
  if (phoneMissing) console.log('Telefón autoservisu skript nevypĺňa: repozitár je verejný. Doplňte ho v Nastaveniach, Údaje autoservisu.');
} catch (error) {
  printError(error);
  process.exitCode = 1;
}
