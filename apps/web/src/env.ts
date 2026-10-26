type Source = Record<string, string | undefined>;

/** Reads the named variables; throws one error naming every missing or empty one, never a value. */
export function readEnv<const K extends string>(source: Source, names: readonly K[]): Record<K, string> {
  const missing = names.filter((name) => !source[name]);
  if (missing.length > 0) {
    throw new Error(`Chýbajú premenné prostredia: ${missing.join(', ')}. Doplňte ich do .env (vzor je .env.example).`);
  }
  return Object.fromEntries(names.map((name) => [name, source[name]])) as Record<K, string>;
}

/** Variables the running app needs. Memoised, so the check runs once. */
let env: ReturnType<typeof readAppEnv> | undefined;
const readAppEnv = () => readEnv(process.env, ['DATABASE_URL', 'BETTER_AUTH_SECRET']);
export const appEnv = () => (env ??= readAppEnv());
