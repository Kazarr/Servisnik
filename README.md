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

V `.env` (kópia [`.env.example`](.env.example)) doplň premenné, ktoré sú tam prázdne. Chýbajúca premenná zastaví appku s hláškou, ktorá ju pomenuje. `BETTER_AUTH_SECRET` vygeneruješ takto:

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
pnpm e2e                               # batch tier: build appky, čerstvá databáza, špecifikácie z apps/web/e2e
pnpm smoke http://localhost:3000       # deploy tier: prihlasovacia stránka a /api/health odpovedia 200, inak nenulový exit
```

`pnpm e2e` si spustí vlastný PostgreSQL 17 cez Testcontainers (nie ten z Compose), aplikuje migrácie, založí admina a spustí production build appky na porte z [`apps/web/playwright.config.ts`](apps/web/playwright.config.ts) (`$env:E2E_PORT` ho prepíše). Test zlyhá pri chybe v konzole, výnimke stránky alebo odpovedi 5xx. Nečakaný výpis servera na stderr nezlyhá test, ale celý beh v teardown ([`apps/web/e2e/global-setup.ts`](apps/web/e2e/global-setup.ts)).

## Nasadenie

Testovacie prostredie beží na DigitalOcean (FRA1): služba z image, spravovaný cluster PostgreSQL 17, pre-deploy job, ktorý pred každým nasadením aplikuje migrácie, a post-deploy job, ktorý po nasadení založí admina. Všetko opisuje [`.do/app.yaml`](.do/app.yaml), image [`Dockerfile`](Dockerfile) (`node:24-slim`, Next.js `standalone`, beží ako ne-root `node`). Nasadzuje ho workflow [`deploy`](.github/workflows/deploy.yml), ktorý spúšťa Kazarr rukou z vetvy `main`. Prostredie nezakladá ani nespúšťa agent.

Cena testovacieho prostredia: služba $5 + spravovaný PostgreSQL (Basic, 1 GiB RAM, 1 vCPU, 10 GiB) $15,15 = **$20,15 mesačne** bez DPH ([Research: Hosting](https://github.com/Kazarr/Servisnik/issues/47), ceny z 2026-10-21). S vývojovou databázou v appke by to bolo $12, ale tá nemá zdokumentované zálohy.

### Image lokálne

Treba Docker Desktop a PostgreSQL z Compose (`pnpm services:up`, port z `POSTGRES_PORT` v `.env`, tu 5432).

```powershell
docker build -t servisnik .
$db = 'postgres://servisnik:servisnik@host.docker.internal:5432/servisnik'   # Compose PostgreSQL zvnútra kontajnera
docker run --rm -e DATABASE_URL=$db servisnik node /migrate/apps/web/scripts/migrate.ts   # príkaz pre-deploy jobu
docker run --rm --env-file .env -e DATABASE_URL=$db servisnik node /migrate/apps/web/scripts/seed.ts   # príkaz post-deploy jobu: admin z ADMIN_EMAIL a ADMIN_PASSWORD
docker run -d --name servisnik-app -p 3000:3000 --env-file .env -e DATABASE_URL=$db servisnik
pnpm smoke http://localhost:3000
docker rm -f servisnik-app
```

`pnpm smoke <url>` je deploy tier: overí, že prihlasovacia stránka a `/api/health` odpovedajú 200 (bez presmerovania), inak vypíše, čo zlyhalo, a skončí nenulovým exitom.

### Čo urobí Kazarr raz

Agent nič z toho neurobí: ide o účet, platbu, token a tajomstvá.

1. **Účet na DigitalOcean:** registrácia, 2FA, platobná karta.
2. **Register:** Container Registry vo FRA1 (jeden na účet; názov si workflow zistí sám).
3. **Databáza:** spravovaný cluster PostgreSQL 17 vo FRA1, najmenšia veľkosť, s názvom `servisnik-test-db` (ten je v `.do/app.yaml`). V paneli Databases > Create, alebo `doctl`:

   ```powershell
   doctl databases create servisnik-test-db --engine pg --version 17 --region fra1 --size db-s-1vcpu-1gb --num-nodes 1
   ```

4. **Token:** API token s právom čítať a zapisovať App Platform a Container Registry (DigitalOcean > API > Generate New Token).
5. **GitHub Environment `test`:** workflow `deploy` beží na ľubovoľnej vetve a vetva si môže priniesť vlastné workflow, preto deploy secrets nepatria do repo secrets, ale do prostredia obmedzeného na `main`. Hodnoty secrets nech sú z písmen, číslic a `-_.`: action ich vkladá ako text do `.do/app.yaml`. Hodnotu každého vypýta `gh`. Workflow pred zostavením skontroluje štyri povinné a vypíše tie, ktoré chýbajú.

   ```powershell
   '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' | gh api --method PUT repos/Kazarr/Servisnik/environments/test --input -
   gh api --method POST repos/Kazarr/Servisnik/environments/test/deployment-branch-policies -f name=main
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"   # hodnota pre BETTER_AUTH_SECRET
   foreach ($name in 'DIGITALOCEAN_ACCESS_TOKEN', 'BETTER_AUTH_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD') {
     gh secret set $name --env test --repo Kazarr/Servisnik
   }
   ```

   `KROS_API_URL`, `KROS_API_TOKEN`, `KROS_WEBHOOK_SECRET` a `KROS_VAT_PAYER_TYPE` pridaj do toho istého prostredia s #81 (`gh secret set <meno> --env test`). Appka ich zatiaľ nečíta, workflow ich nevyžaduje a nenastavené odovzdá spec prázdne.
6. **Appka zo specu:** prvý beh workflow vytvorí appku `servisnik-test` z `.do/app.yaml` (službu, väzbu na cluster, pre-deploy migráciu aj post-deploy seed admina), každý ďalší ju aktualizuje. Admin z `ADMIN_EMAIL` a `ADMIN_PASSWORD` vznikne po nasadení sám.

   ```powershell
   gh workflow run deploy --repo Kazarr/Servisnik --ref main
   gh run watch --repo Kazarr/Servisnik          # vyberie bežiaci beh
   ```

### Čo workflow robí

Spúšťa sa len cez `workflow_dispatch` a job beží len z vetvy `main`, v prostredí `test`. V tomto poradí: skontroluje secrets, odmietne commit, ktorého check `ticket` nie je zelený, zostaví image označený SHA commitu a pošle ho do registra, nasadí `.do/app.yaml`, počká na dokončenie a spustí `pnpm smoke` proti adrese nasadenej appky. Migrácia zlyhá pred prepnutím a stará verzia beží ďalej. Akcie, ktoré dostanú token DigitalOcean, sú pripnuté na SHA commitu, logy nasadenia sa do verejného logu nevypisujú.

### Databáza a TLS

DigitalOcean podpisuje databázy vlastnou CA, ktorú Node nepozná. Spec preto viaže `DATABASE_URL` aj `DATABASE_CA_CERT` (`${db.CA_CERT}`) a `createDb` v `apps/web/src/db/index.ts` (jediné miesto, kde sa pripájajú appka, `db:migrate` aj `db:seed`) overuje server proti tejto CA. `pg` nechá `sslmode` z URL prevážiť nad `ssl`, preto mu `createDb` pri zadanej CA odovzdá URL bez `sslmode`. Lokálne (`DATABASE_CA_CERT` prázdne) sa URL použije tak, ako je.

### Známe obmedzenia

- Seed beží po každom nasadení: ak admin zmení heslo v appke, ďalšie nasadenie ho vráti na `ADMIN_PASSWORD`. Zmena hesla v appke zatiaľ nie je.
- Prvý skutočný beh workflow ešte nebežal: `deploy` je overený lokálne (image, migrácia, seed, `pnpm smoke`) a testmi konfigurácie, nie proti DigitalOcean. Neoverené zostáva, či DigitalOcean prijme `KROS_*` bez hodnoty; ak nie, nastav ich pri prvom behu na skutočné hodnoty z #61 a #62.
