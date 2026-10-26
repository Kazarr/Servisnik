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
pnpm smoke http://localhost:3000       # deploy tier: prihlasovacia stránka a /api/health odpovedia 200, inak nenulový exit
```

`pnpm e2e` si spustí vlastný PostgreSQL 17 cez Testcontainers (nie ten z Compose), aplikuje migrácie, založí admina a spustí production build appky na porte 3100. Iný port nastavíš cez `$env:E2E_PORT = 3101`. Test zlyhá pri chybe v konzole, výnimke stránky, odpovedi 5xx aj pri nečakanom výpise servera na stderr.

## Nasadenie

Testovacie prostredie beží na DigitalOcean (FRA1): služba z image, PostgreSQL 17 a pre-deploy job, ktorý pred každým nasadením aplikuje migrácie. Všetko opisuje [`.do/app.yaml`](.do/app.yaml), image [`Dockerfile`](Dockerfile) (`node:24-slim`, Next.js `standalone`, beží ako ne-root `node`). Nasadzuje ho workflow [`deploy`](.github/workflows/deploy.yml), ktorý spúšťa Kazarr rukou. Prostredie nezakladá ani nespúšťa agent.

### Image lokálne

Treba Docker Desktop a PostgreSQL z Compose (`pnpm services:up`, port z `POSTGRES_PORT` v `.env`, tu 5432).

```powershell
docker build -t servisnik .
$db = 'postgres://servisnik:servisnik@host.docker.internal:5432/servisnik'   # Compose PostgreSQL zvnútra kontajnera
docker run --rm -e DATABASE_URL=$db servisnik node /migrate/scripts/migrate.ts   # príkaz pre-deploy jobu
docker run --rm --env-file .env -e DATABASE_URL=$db servisnik node /migrate/scripts/seed.ts   # admin z ADMIN_EMAIL a ADMIN_PASSWORD
docker run -d --name servisnik-app -p 3000:3000 --env-file .env -e DATABASE_URL=$db servisnik
pnpm smoke http://localhost:3000
docker rm -f servisnik-app
```

`pnpm smoke <url>` je deploy tier: overí, že prihlasovacia stránka a `/api/health` odpovedajú 200 (bez presmerovania), inak vypíše, čo zlyhalo, a skončí nenulovým exitom.

### Čo urobí Kazarr raz

Agent nič z toho neurobí: ide o účet, platbu, token a tajomstvá.

1. **Účet na DigitalOcean:** registrácia, 2FA, platobná karta ([Research: Hosting](https://github.com/Kazarr/Servisnik/issues/47): test vychádza na $12/mes.).
2. **Register:** Container Registry vo FRA1 (jeden na účet; názov si workflow zistí sám).
3. **Token:** API token s právom čítať a zapisovať App Platform a Container Registry (DigitalOcean > API > Generate New Token).
4. **GitHub secrets:** token a tajomstvá appky, každý sa nastaví osobitne a hodnotu vypýta `gh`. Workflow ich pred zostavením skontroluje a vypíše všetky, ktoré chýbajú. `KROS_*` appka zatiaľ nečíta, ale secret nesmie byť prázdny, kým ich nenahradia skutočné hodnoty (`KROS_API_URL` z #61, `KROS_VAT_PAYER_TYPE` z fixtures #62), dá sa tam napísať `zatial-nic`.

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"   # hodnota pre BETTER_AUTH_SECRET
   foreach ($name in 'DIGITALOCEAN_ACCESS_TOKEN', 'BETTER_AUTH_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'KROS_API_URL', 'KROS_API_TOKEN', 'KROS_WEBHOOK_SECRET', 'KROS_VAT_PAYER_TYPE') {
     gh secret set $name --repo Kazarr/Servisnik
   }
   ```

5. **Appka zo specu:** prvý beh workflow vytvorí appku `servisnik-test` z `.do/app.yaml` (službu, databázu aj pre-deploy job), každý ďalší ju aktualizuje.

   ```powershell
   gh workflow run deploy --repo Kazarr/Servisnik --ref main
   gh run watch --repo Kazarr/Servisnik          # vyberie bežiaci beh
   ```

6. **Prvý admin:** v DigitalOcean otvor appku `servisnik-test` > služba `web` > Console a spusti `node /migrate/scripts/seed.ts`. Je idempotentný, služba má `ADMIN_EMAIL` a `ADMIN_PASSWORD` zo secrets.

### Čo workflow robí

Spúšťa sa len cez `workflow_dispatch`. V tomto poradí: skontroluje secrets, odmietne commit, ktorého check `ticket` nie je zelený, zostaví image označený SHA commitu a pošle ho do registra, nasadí `.do/app.yaml`, počká na dokončenie a spustí `pnpm smoke` proti adrese nasadenej appky. Migrácia zlyhá pred prepnutím a stará verzia beží ďalej.

### Známe obmedzenia

- Appka sa k databáze DigitalOcean pripája šifrovane, ale bez overenia reťaze certifikátov (`uselibpqcompat` v `DATABASE_URL`): DigitalOcean podpisuje databázy vlastnou CA, ktorú Node nepozná, a `pg` pri `sslmode=require` reťaz overuje. Overenie reťaze vyžaduje `ssl.ca` v `apps/web/src/db/index.ts` z `${db.CA_CERT}`.
- Testovacia databáza je vývojová databáza v appke ($7/mes.); produkcia dostane spravovaný cluster so zálohami ([#51](https://github.com/Kazarr/Servisnik/issues/51)).
- Prvý skutočný beh workflow ešte nebežal: `deploy` je overený lokálne (image, migrácia, `pnpm smoke`) a testmi konfigurácie, nie proti DigitalOcean.
