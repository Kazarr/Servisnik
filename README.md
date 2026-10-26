# Servisnik
Jednoduchý ERP systém pre autoservisy: zákazky, zákazníci, vozidlá, sklad a faktúry na jednom mieste. Servisník: odľahčený ERP pre automechanikov. Bez zbytočností, len to, čo dielňa denne potrebuje.

## Stack

TypeScript v pnpm workspace: Next.js 16.4 (`apps/web`), Drizzle ORM nad PostgreSQL 17, Better Auth, Vitest a Playwright na Node 24. Servisník stavajú AI agenti, preto rozhodla zmeraná spoľahlivosť agentov (Next.js je jediný porovnávaný framework s takým meraním) a to, že Kazarr Next.js pozná. Pravidlá Servisníka idú do balíka `packages/domain` bez frameworku a databázy, aby sa testovali unit testami. Úvahy a porovnanie možností: [docs/adr/0001-stack.md](docs/adr/0001-stack.md).

## Lokálne prostredie

Treba Docker Desktop, Node 24 a pnpm. PostgreSQL 17 a MinIO (S3) bežia v Docker Compose, prístupy sú v `.env` (mimo gitu).

```powershell
Copy-Item .env.example .env   # raz
pnpm services:up              # PostgreSQL :5432, MinIO :9000, konzola :9001
pnpm services:down            # dáta ostanú vo volumes; `docker compose down -v` ich zmaže
pnpm tunnel                   # verejná https://*.trycloudflare.com -> TUNNEL_TARGET; Ctrl+C ho zastaví
```

Tunel je Cloudflare quick tunnel bez účtu pre webhook KROS. URL sa mení pri každom spustení, nájdeš ju vo výpise `pnpm tunnel`.

## Spustenie appky

V `.env` (kópia `.env.example`) doplň `BETTER_AUTH_SECRET`, `ADMIN_EMAIL` a `ADMIN_PASSWORD`. Chýbajúca premenná zastaví appku s hláškou, ktorá ju pomenuje. Tajomstvo vygeneruješ takto:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

```powershell
pnpm install
pnpm services:up   # PostgreSQL z Compose
pnpm db:migrate    # aplikuje SQL migrácie z apps/web/drizzle
pnpm db:seed       # založí admina z ADMIN_EMAIL a ADMIN_PASSWORD, alebo mu nastaví toto heslo; dá sa spustiť opakovane
pnpm dev           # http://localhost:3000 presmeruje na prihlásenie
```

Registrácia v appke nie je, prihlásiť sa dá len admin zo seedu. Zmenu schémy (`apps/web/src/db/schema.ts`) premietne `pnpm --filter @servisnik/web db:generate` do novej migrácie, ktorú commitni.

## Testy

```powershell
pnpm verify                            # ticket tier: typecheck a testy; Testcontainers spustí PostgreSQL 17, Docker musí bežať
pnpm e2e:install                       # raz, stiahne prehliadač pre e2e
pnpm e2e                               # batch tier: build appky, čerstvá databáza, cesta prihlásenie, menu, odhlásenie
```

`pnpm e2e` si spustí vlastný PostgreSQL 17 cez Testcontainers (nie ten z Compose), aplikuje migrácie, založí admina a spustí production build appky na porte 3100. Iný port nastavíš cez `$env:E2E_PORT = 3101`. Test zlyhá pri chybe v konzole, výnimke stránky, odpovedi 5xx aj pri nečakanom výpise servera na stderr.
