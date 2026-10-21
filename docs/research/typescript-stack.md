# Research: TypeScript full-stack pre Servisník

Ticket [#45](https://github.com/Kazarr/Servisnik/issues/45), vstup pre [Rozhodnutie o stacku a architektúre (#44)](https://github.com/Kazarr/Servisnik/issues/44). Stav k 2026-10-21, len primárne zdroje (oficiálne docs, npm registry, GitHub repozitáre výrobcov).

## Otázka

Ktorá TypeScript full-stack zostava sa najlepšie hodí na Servisník? Porovnané sú dve najvážnejšie: **Next.js 16.4 (App Router)** a **React Router 8.5 vo framework mode** (nástupca Remixu). Pre každú: ORM a migrácie nad PostgreSQL, prihlásenie a role, HTML → PDF na A4, import `.xlsx`/`.csv`, fotky z mobilu, webhook s HMAC-SHA256, testovanie biznis logiky bez frameworku/DB/siete, deploy cez GitHub Actions.

Prečo nie SvelteKit: `@sveltejs/kit` 3.0.0 vyšiel 2026-10-01, teda tri týždne pred termínom, a 3.1.0 2026-10-14 ([npm registry](https://registry.npmjs.org/@sveltejs/kit)). Čerstvá major verzia znamená, že agenti ju takmer nepoznajú z tréningových dát. Hono samostatne nie je full-stack (nerieši UI). K React Routeru ho netreba, lebo route moduly obslúžia webhook aj PDF priamo a oficiálne šablóny bežia na `react-router-serve` alebo na Expresse ([react-router-templates](https://github.com/remix-run/react-router-templates)).

## Zhrnutie

- **Odporúčanie: Next.js 16.4** (App Router, Node runtime, self-host v Dockeri cez `output: 'standalone'`) + Drizzle ORM 0.45 + Better Auth 1.7 + Playwright 1.64 (PDF) + SheetJS CE 0.20.3 + sharp 0.35 + Vitest 5.
- Rozhoduje spoľahlivosť agentov. Next.js ako jediný zverejňuje vlastné evaly agentov: Claude Opus 5.5 s Claude Code dosahuje 97 % (pass@4, beh 2026-10-13). Oba frameworky nesú v npm balíku dokumentáciu k nainštalovanej verzii a oba dávajú agentom inštrukcie (`AGENTS.md`, resp. skill). React Router 8 však vyšiel až 2026-06-17 a merania nemá.
- Testovateľnosť biznis logiky je v oboch rovnaká: doména žije v čistých TS moduloch a Vitest ju spustí bez frameworku, DB aj siete. PDF, xlsx/csv a HMAC riešia knižnice nezávislé od frameworku, takže aj tu sú obe rovnaké.
- Deploy: oba bežia ako Docker image na Debian-based Node, lebo Alpine nie je medzi OS podporovanými Playwrightom. Next má oficiálny Dockerfile pre `standalone`.
- Next.js má však väčší a rýchlo sa meniaci povrch: 48 bezpečnostných advisories za 12 mesiacov (6 critical) oproti 19 (1 critical) pri React Routeri. K tomu Cache Components zapnuté v nových appkách a limit 1 MB pre Server Actions. Preto treba pravidelné záplaty a tenké adaptéry: webhook, PDF a upload idú cez Route Handlers.
- Druhá voľba: React Router 8.5. Má jednoduchší model (loader/action = `Request` → `Response`) a menší povrch. Ak ADR uprednostní bezpečnostný povrch pred dôkazmi o agentoch, vyhráva on.

## Zistenia

### 0. Verzie (2026-10-21)

| Komponent | Verzia | Poznámka | Zdroj |
|---|---|---|---|
| Node.js | 24.22.1 LTS | v24 je Maintenance LTS od 2026-10-20, v26 sa stane LTS 2026-10-28 | [Release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json), [dist index](https://nodejs.org/dist/index.json) |
| Next.js | 16.4.2 | `engines.node >= 20.9.0` | [npm](https://registry.npmjs.org/next), [blog 16.4](https://nextjs.org/blog/next-16-4) |
| React | 19.3.1 | Next 16.4 ide s React 19.3 | [npm](https://registry.npmjs.org/react) |
| React Router | 8.5.0 | v7.18.4 sa ešte vydáva, `engines.node >= 22.22.0` | [npm](https://registry.npmjs.org/react-router), [changelog](https://reactrouter.com/changelog) |
| Drizzle ORM / Kit | 0.45.4 / 0.31.11 | 1.0 je stále RC | [npm](https://registry.npmjs.org/drizzle-orm), [releases](https://github.com/drizzle-team/drizzle-orm/releases) |
| Prisma | 7.10.1 stabilná | npm tag `latest` ukazuje na 8.0.0-rc.24 | [npm](https://registry.npmjs.org/prisma), [releases](https://github.com/prisma/prisma/releases) |
| Better Auth | 1.7.12 | + `@better-auth/drizzle-adapter` 1.7.12 | [npm](https://registry.npmjs.org/better-auth) |
| Playwright | 1.64.1 | | [npm](https://registry.npmjs.org/playwright) |
| SheetJS CE | 0.20.3 | balík `xlsx` na npm (0.18.5) je zastaraný | [SheetJS install](https://docs.sheetjs.com/docs/getting-started/installation/nodejs), [CDN list](https://cdn.sheetjs.com/xlsx.lst) |
| sharp | 0.35.5 | | [npm](https://registry.npmjs.org/sharp) |
| Vitest | 5.0.5 | `engines.node ^22.12 \|\| ^24 \|\| >=26` | [npm](https://registry.npmjs.org/vitest) |
| TypeScript | 7.0.2 (`latest`) | šablóna React Routera stále používa `^5.9.3` | [npm](https://registry.npmjs.org/typescript), [RR šablóna](https://github.com/remix-run/react-router-templates/blob/main/default/package.json) |

### 1. ORM a verziované migrácie nad PostgreSQL

ORM nezávisí od frameworku, takže platí pre obe možnosti rovnako.

- **Drizzle ORM 0.45 (odporúčaný).** `drizzle-kit generate` porovná TS schému s predchádzajúcim snapshotom a zapíše verziovanú SQL migráciu do `drizzle/`. `drizzle-kit migrate` potom aplikuje len neaplikované migrácie podľa histórie v DB. Migrácie sa dajú spustiť aj pri štarte appky cez `migrate(db)` z `drizzle-orm/node-postgres/migrator` ([Drizzle migrations](https://orm.drizzle.team/docs/migrations)). Migrácie sú čisté SQL súbory, takže ich vie skontrolovať človek aj agent.
- **Riziko Drizzle 1.0:** 1.0 je zatiaľ RC (inštaluje sa cez `@rc`). Mení štruktúru priečinka migrácií (ruší `journal.json`), prináša Relational Queries v2 a ruší `drizzle-kit drop`. Prevod rieši `npx drizzle-kit up` ([upgrade v1](https://orm.drizzle.team/docs/upgrade-v1)). Odporúčanie: zafixovať 0.45.x a nepoužívať relational queries v1 API, aby bol neskorší prechod lacný.
- **Prisma (neodporúčaná teraz):** stabilná je 7.10.1, ale npm tag `latest` ukazuje na 8.0.0-rc.24, takže `npm i prisma` nainštaluje RC ([npm](https://registry.npmjs.org/prisma)). Oficiálne docs už opisujú Prisma 8 s `contract.prisma`, `migration plan` a `db migrate` namiesto `migrate dev/deploy`. Migrácie v nej sú `migration.ts` + `ops.json`, nie čisté SQL ([Prisma Migrate docs](https://www.prisma.io/docs/orm/prisma-migrate/getting-started)). Release notes 8.0.0-rc.19 ešte obsahujú breaking changes medzi RC verziami ([release](https://github.com/prisma/prisma/releases/tag/v8.0.0-rc.19)). Agent by tu ľahko miešal v7 a v8 API.
- **Next.js:** `pg` aj `@prisma/client` sú na predvolenom zozname `serverExternalPackages`, takže netreba nič konfigurovať ([serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)). Drizzle sa používa priamo v Server Components, Server Actions a Route Handlers.
- **React Router:** Drizzle sa volá v `loader`/`action` (serverový kód route modulu). Framework ho žiadnym spôsobom neobmedzuje.

### 2. Prihlásenie e-mailom a heslom a role (admin, mechanik)

Spoločná knižnica pre obe možnosti: **Better Auth 1.7**.

- E-mail a heslo zapína `emailAndPassword.enabled`. Heslá hashuje `scrypt` (natívne v Node), cez `password.hash/verify` sa dá prepnúť na Argon2 ([email-password](https://www.better-auth.com/docs/authentication/email-password)). `disableSignUp` vypne verejnú registráciu, heslo má predvolene 8–128 znakov, session trvá 7 dní a rate limit je v produkcii zapnutý ([options](https://www.better-auth.com/docs/reference/options)).
- **Role:** admin plugin dáva roly `admin`/`user` a vlastné roly cez `createAccessControl` + `ac.newRole`, čo pokryje rolu `mechanik`. Server overuje oprávnenia cez `auth.api.userHasPermission`, admin zakladá používateľov cez `auth.api.createUser` a deaktivuje ich cez `banUser`. Prvého admina vytvorí `npx auth@latest create-admin` ([admin plugin](https://www.better-auth.com/docs/plugins/admin)).
- **Schéma:** Better Auth potrebuje tabuľky `user`, `session`, `account` a `verification`, heslo patrí ku `credential` účtu v `account`. Názvy tabuliek a stĺpcov sa menia cez `modelName`/`fields`, vlastné polia (napr. `aktivny`) cez `user.additionalFields` ([database](https://www.better-auth.com/docs/concepts/database)). Tabuľka `pouzivatel` z K01 sa preto mapuje na `user` a heslo neleží v nej. Drizzle schému vygeneruje `npx auth@latest generate`, migrácie potom urobí `drizzle-kit generate/migrate` ([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)).
- **Next.js:** handler v `app/api/auth/[...all]/route.ts` cez `toNextJsHandler(auth)`. Session sa číta cez `auth.api.getSession({ headers: await headers() })`. Plugin `nextCookies` musí byť v poli pluginov posledný, inak Server Actions nenastavia cookies ([Better Auth × Next](https://www.better-auth.com/docs/integrations/next)). Better Auth je na oficiálnom zozname auth knižníc Next.js. Next odporúča overovať prístup v Data Access Layer pri dátach a v proxy robiť len „optimistické" kontroly. Server Actions treba brať ako verejné endpointy ([Next.js authentication](https://nextjs.org/docs/app/guides/authentication)).
- **React Router:** handler v `app/routes/api.auth.$.ts` (`loader` + `action` vracajú `auth.handler(request)`) ([Better Auth × React Router](https://www.better-auth.com/docs/integrations/react-router)). Session v loaderi: `auth.api.getSession({ headers: request.headers })` ([basic usage](https://www.better-auth.com/docs/basic-usage)). Integračná stránka uvádza len v7 a v8 nespomína. React Router má vlastné session API (`createCookieSessionStorage`, `createSessionStorage`), ale nerieši heslá ani knižnicu neodporúča ([sessions and cookies](https://reactrouter.com/explanation/sessions-and-cookies)).
- „Mechanik nevidí ceny" (K01, K06, K08) je čistá funkcia nad doménou (napr. `zakazkaPreMechanika(z)` odstráni ceny). Testuje sa v unit testoch a framework ju len zavolá.

### 3. Tlač HTML → PDF na A4 na serveri

Spoločný nástroj pre obe možnosti: **Playwright 1.64, Chromium headless.**

- `page.setContent(html)` a potom `page.pdf({ format: 'A4', printBackground: true, margin, preferCSSPageSize })`. `format` má prednosť pred `width/height` a `preferCSSPageSize` uprednostní CSS `@page { size: A4 }`. Ďalšie voľby sú hlavička a pätička s `pageNumber`/`totalPages`, `tagged` (prístupné PDF) a `outline`. PDF sa generuje s CSS médiom `print` a farby sa dajú vynútiť cez `-webkit-print-color-adjust` ([Page.pdf zdroj docs](https://github.com/microsoft/playwright/blob/main/docs/src/api/class-page.md), [playwright.dev](https://playwright.dev/docs/api/class-page#page-pdf)).
- Podporované OS: Debian 12/13 a Ubuntu 22.04/24.04/26.04. Alpine v zozname nie je ([system requirements](https://playwright.dev/docs/intro)). Oficiálny image `mcr.microsoft.com/playwright:v1.64.0-noble` je podľa docs „len na testovanie a vývoj" ([Docker](https://playwright.dev/docs/docker)). Do produkčného image sa preto Chromium inštaluje cez `npx playwright install --with-deps chromium`, prípadne `--only-shell` len pre headless shell ([browsers](https://github.com/microsoft/playwright/blob/main/docs/src/browsers.md)).
- **Next.js:** `playwright` a `playwright-core` sú v predvolených `serverExternalPackages` ([zoznam](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)). PDF sa vracia z Route Handlera ako `new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } })` ([route.js](https://nextjs.org/docs/app/api-reference/file-conventions/route)). Pri `standalone` treba overiť, že trace obsahuje `playwright-core`. Ak nie, pomôže `outputFileTracingIncludes` ([output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)).
- **React Router:** resource route (loader bez komponentu) vráti `Response` s `application/pdf`. Linkuje sa cez `<a>` alebo `<Link reloadDocument>` ([resource routes](https://reactrouter.com/how-to/resource-routes)). Bundling netreba riešiť.
- HTML šablóny sú v oboch React komponenty renderované na serveri alebo čisté HTML stringy. Vstup (zákazka, firma) aj výpočet súm sú čisté funkcie, ktoré sa dajú testovať.

### 4. Import `.xlsx` a `.csv`

Spoločná knižnica pre obe možnosti: **SheetJS CE 0.20.3**, jedna knižnica na oba formáty.

- Inštaluje sa z CDN: `npm i --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Balík `xlsx` na npm registri ostal na 0.18.5 a SheetJS ho označuje za zastaraný ([install](https://docs.sheetjs.com/docs/getting-started/installation/nodejs)). Licencia je Apache 2.0 ([CDN](https://cdn.sheetjs.com/)).
- `XLSX.read(buffer, { type: 'buffer' })` načíta xlsx aj CSV. CSV je fallback formát, keď sa nič iné nezhoduje ([parse options](https://docs.sheetjs.com/docs/api/parse-options)). `sheet_to_json(ws, { header: 'A' })` vráti riadky s kľúčmi podľa písmen stĺpcov (A, B, C…). Presne v tomto tvare K07 ukladá mapovanie (`{"kod":"A","nazov":"C",...}`) ([sheet_to_json](https://docs.sheetjs.com/docs/api/utilities/array)). Náhľad prvých 10 riadkov dá voľba `range`/slice.
- Validácia riadkov, chybné riadky a dopočet predajnej ceny cez prirážku sú čisté funkcie nad poľom riadkov a dajú sa unit testovať s fixture (#63).
- ExcelJS ako alternatíva: posledná verzia 4.4.0 je z 2023-10-19 ([npm](https://registry.npmjs.org/exceljs)), čo je stagnácia.
- **Next.js:** upload cez Server Action má predvolený limit tela 1 MB (`experimental.serverActions.bodySizeLimit`) ([serverActions](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)). Väčší export z Partslinku treba poslať cez Route Handler (`request.formData()`) alebo limit zvýšiť.
- **React Router:** `action` číta `request.formData()` alebo streamovací `parseFormData` z `@remix-run/form-data-parser` 1.0.0 s limitmi `maxFileSize`/`maxTotalSize` ([file uploads](https://reactrouter.com/how-to/file-uploads), [README](https://github.com/remix-run/remix/tree/main/packages/form-data-parser)).

### 5. Nahrávanie a zmenšenie fotiek z mobilu (R4)

- **Klient (obe možnosti):** `<input type="file" accept="image/*" capture="environment">` otvorí na mobile zadný fotoaparát, na desktope bežný výber súboru ([MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)). Zmenšenie pred odoslaním (canvas → JPEG, max. 1600 px) ušetrí prenos aj limity tela požiadavky.
- **Server (obe možnosti): sharp 0.35** cez `resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })` ([resize](https://sharp.pixelplumbing.com/api-resize)) a `autoOrient()` podľa EXIF ([operations](https://github.com/lovell/sharp/blob/main/docs/src/content/docs/api-operation.md)). Prebuilt sharp číta JPEG, PNG, WebP, GIF, AVIF, TIFF a SVG. HEIC (iPhone) potrebuje vlastnú libvips s libheif ([formáty](https://github.com/lovell/sharp/blob/main/docs/src/content/docs/index.md), [heif](https://github.com/lovell/sharp/blob/main/docs/src/content/docs/api-output.md)), preto zmenšenie na klientovi do JPEG zostáva primárna cesta.
- **Next.js:** `sharp` je v predvolených `serverExternalPackages`. Pri Server Action treba rátať s limitom 1 MB, preto upload ide cez Route Handler. Ak appka používa `proxy.ts`, Next bufferuje telo len do 10 MB (`proxyClientMaxBodySize`) a väčšie telo potichu oreže, bez chyby ([proxyClientMaxBodySize](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize)).
- **React Router:** `parseFormData` streamuje súbor do úložiska (`@remix-run/file-storage`, napr. `LocalFileStorage`) a súbor sa servíruje cez resource route ([file uploads](https://reactrouter.com/how-to/file-uploads)).

### 6. Prijatie webhooku s overením HMAC-SHA256

Logika je framework-agnostic čistá funkcia nad `node:crypto`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyKrosSignature(rawBody: Buffer, headerB64: string | null, secret: string): boolean {
  if (!headerB64) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const got = Buffer.from(headerB64, 'base64');
  return got.length === expected.length && timingSafeEqual(got, expected); // timingSafeEqual hádže pri rôznej dĺžke
}
```

- `timingSafeEqual` porovnáva v konštantnom čase, je určený na HMAC digesty a pri rôznej dĺžke vstupov hádže chybu ([Node crypto](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)). Hlavička `X-Kros-Signature-256` (HMAC-SHA256, Base64) pochádza z K09 ([#34](https://github.com/Kazarr/Servisnik/issues/34)). Presný podpisovaný obsah rieši [#48](https://github.com/Kazarr/Servisnik/issues/48).
- **Next.js:** Route Handler `POST(request)` číta surové telo cez `await request.text()`/`arrayBuffer()`, bez `bodyParser` ([route.js – Webhooks](https://nextjs.org/docs/app/api-reference/file-conventions/route)). Webhook route treba vylúčiť z `proxy.ts` matchera, inak hrozí orezanie tela (bod 5).
- **React Router:** resource route iba s `action`. `request` je štandardný Fetch `Request`, takže `await request.arrayBuffer()` funguje ([resource routes](https://reactrouter.com/how-to/resource-routes)).

### 7. Testovanie biznis logiky bez frameworku, databázy a siete

- **Spoločné:** doména (čísla zákaziek, prechody stavov, marža, DPH, mapovanie importu, poskladanie JSON pre KROS, overenie podpisu, filter cien pre mechanika) žije v `src/domain/*.ts` bez importov frameworku a DB. Vitest 5 ju testuje v prostredí `node`. Framework rieši len tenké adaptéry. Testovateľnosť preto nezávisí od voľby frameworku.
- **Next.js:** oficiálny návod pre Vitest uvádza, že `async` Server Components Vitest nepodporuje, a odporúča na ne E2E ([Vitest v Next](https://nextjs.org/docs/app/guides/testing/vitest)). Server Actions čítajú `cookies()`/`headers()` z `next/headers` (request kontext Nextu), preto sa adaptéry ťažšie volajú mimo frameworku. To je ďalší dôvod držať ich tenké.
- **React Router:** `loader`/`action` sú async funkcie nad Fetch `Request`. `createRoutesStub` je určený na komponenty s router hookmi. Na celé routy docs odporúčajú integračné alebo E2E testy (Playwright) ([testing](https://reactrouter.com/start/framework/testing)). Adaptéry sa tu dajú testovať o niečo ľahšie.

### 8. Deploy na hosting s PostgreSQL cez GitHub Actions

- **Spoločné:** workflow zostaví Docker image a pushne ho do GHCR (`docker/login-action`, `docker/metadata-action`, `docker/build-push-action`, `permissions: packages: write`, prihlásenie cez `GITHUB_TOKEN`) ([GitHub Docs](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)). Host image stiahne a pred štartom spustí migrácie (`drizzle-kit migrate` alebo `migrate(db)` pri štarte). Konkrétny hosting rieši [#47](https://github.com/Kazarr/Servisnik/issues/47).
- **Next.js:** `output: 'standalone'` vytvorí `.next/standalone` s `server.js` bez potreby `node_modules`. `public` a `.next/static` sa kopírujú ručne a server počúva na `PORT`/`HOSTNAME` ([output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)). Oficiálny Dockerfile beží na `node:24.13.0-slim` (Debian, kompatibilný s Playwrightom) ako používateľ `node` ([with-docker](https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile)). Self-hosting guide odporúča reverse proxy pred Nextom. Jedna inštancia s diskom nepotrebuje nastavovať cache, pri viacerých treba `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` a `deploymentId` ([self-hosting](https://nextjs.org/docs/app/guides/self-hosting)).
- **React Router:** šablóna `default` obsahuje Dockerfile (`node:24-alpine`, `react-router-serve ./build/server/index.js`) ([Dockerfile](https://github.com/remix-run/react-router-templates/blob/main/default/Dockerfile)). Kvôli Playwrightu treba base image zmeniť na Debian. Šablóna `node-custom-server` používa Express 5 ([šablóny](https://github.com/remix-run/react-router-templates)).

### 9. Spoľahlivosť AI agentov (hlavné kritérium #44)

- **Next.js:** first-party evaly agentov ([nextjs.org/evals](https://nextjs.org/evals), beh 2026-10-13, pass@4): Claude Opus 5.5 (high) + Claude Code 97 %, GPT 6 Sol + Codex 97 %, najslabší Kimi K2.7 Code 74 %. Od 16.2 `create-next-app` generuje `AGENTS.md`, ktorý agenta posiela do `node_modules/next/dist/docs/`, a npm balík nesie celú dokumentáciu ako Markdown ([Next 16.2 AI](https://nextjs.org/blog/next-16-2-ai)). V `next@16.4.2` je to 474 súborov ([jsDelivr listing](https://data.jsdelivr.com/v1/package/npm/next@16.4.2/flat)). Ďalej pribudlo preposielanie chýb prehliadača do terminálu a lock file dev servera s PID ([16.2 AI](https://nextjs.org/blog/next-16-2-ai)) a `next upgrade --agent` + `experimental.agentUpgrade: 'security'` (pripomienky bezpečnostných upgradov, predvolené) ([16.4](https://nextjs.org/blog/next-16-4)).
- **Next.js, protiváha:** programovací model sa mení. Cache Components sú v nových appkách z `create-next-app` zapnuté od 16.4 a v Next 17 budú default ([16.4](https://nextjs.org/blog/next-16-4)). Čítanie `cookies()` mimo `<Suspense>` je potom build error, takže každá stránka so session potrebuje boundary ([auth s Cache Components](https://nextjs.org/docs/app/guides/authentication-with-cache-components)). Pre ERP, kde je všetko per-user, je to réžia navyše. Chyba je však hlasná, zachytí ju build.
- **React Router:** `create-react-router` od 8.1.0 kopíruje oficiálny agent skill do `.agents/skills/react-router` ([changelog](https://cdn.jsdelivr.net/npm/create-react-router@8.5.0/CHANGELOG.md), [remix-run/agent-skills](https://github.com/remix-run/agent-skills)). Skill agentovi káže určiť mód appky a čítať nainštalované docs. Balík `react-router@8.5.0` ich nesie ako 86 Markdown súborov v `docs/` ([jsDelivr listing](https://data.jsdelivr.com/v1/package/npm/react-router@8.5.0/flat), [SKILL.md](https://cdn.jsdelivr.net/npm/create-react-router@8.5.0/dist/agent-skills/react-router/SKILL.md)). `reactrouter.com/llms.txt` vracia 404 (overené 2026-10-21). Evaly agentov neexistujú. v8 vyšiel 2026-06-17 ([changelog](https://reactrouter.com/changelog)), po tréningovom období väčšiny modelov. Zmeny oproti v7 sú však hlavne odstránenia, napr. `react-router-dom` a future flagy sa stali defaultom. Docs uvádzajú, že kto prijal všetky v7 future flagy, je na v8 pripravený.
- **React Router, mätúce pomenovanie:** Remix 3 nie je postavený na Reacte (fork Preactu) a React Router v7+ je „stabilná platforma" ([Wake up, Remix](https://remix.run/blog/wake-up-remix)). Aj README `@remix-run/form-data-parser` už importuje z `remix/form-data-parser`, takže agent ľahko zamieňa API.

### 10. Bezpečnostný povrch

- GitHub Security Advisories zverejnené 2025-10-21 až 2026-10-21 (spočítané cez GitHub API): **Next.js 48** (6 critical, 17 high), **React Router 19** (1 critical, 8 high) ([Next advisories](https://github.com/vercel/next.js/security/advisories), [RR advisories](https://github.com/remix-run/react-router/security/advisories)).
- Kritické chyby Next.js zasahujú hlavne funkcie, ktoré Servisník nepotrebuje: Image Optimization API (SVG, AVIF), `next/og`, `use cache` s typed arrays a RSC protokol (CVE-2025-66478, [blog](https://nextjs.org/blog)). K tomu prišli opakované obchádzania Middleware/Proxy (CVE-2026-44574, CVE-2026-44575, CVE-2026-64642). Z toho plynie: auth nikdy nerobiť len v proxy (to hovorí aj [Next auth guide](https://nextjs.org/docs/app/guides/authentication)), `next/image` optimalizáciu nepoužívať (`images.unoptimized`) a záplatovať do niekoľkých dní.
- Jediný critical pri React Routeri sa týka `createFileSessionStorage()` s nepodpísanými cookies, čo Servisník nepoužije.

### Porovnanie

| Kritérium | Next.js 16.4 | React Router 8.5 |
|---|---|---|
| Spoľahlivosť agentov | **merané 97 %**, docs v balíku, AGENTS.md | oficiálny skill + docs v balíku, bez meraní, v8 je nová |
| Testovateľnosť domény | rovnaká (čisté TS + Vitest) | rovnaká, adaptéry ľahšie |
| HTML → PDF | Playwright, Route Handler | Playwright, resource route |
| xlsx/csv | SheetJS, pozor na limit 1 MB pri Server Actions | SheetJS, bez limitu frameworku |
| Fotky | sharp + klient, limity 1 MB / 10 MB proxy | sharp + klient, streamovací parser |
| Webhook HMAC | Route Handler, `request.text()` | resource route `action` |
| Deploy | `standalone` + oficiálny Debian Dockerfile | Dockerfile v šablóne (Alpine treba zmeniť na Debian) |
| Bezpečnostný povrch | veľký (48 advisories za rok) | menší (19) |
| Zložitosť modelu | RSC, Server Actions, Cache Components, proxy | loader/action, Request/Response |

## Riziká a otvorené otázky

1. **Tempo záplat Next.js:** 6 critical za rok znamená, že prevádzka po odovzdaní (K10) potrebuje proces pre bezpečnostné upgrady, napr. Dependabot + `agentUpgrade: 'security'`. Kto ho bude robiť po 2026-11-18?
2. **Cache Components zapnúť alebo vypnúť:** v nových appkách zo 16.4 je zapnuté a v Next 17 bude default. Vypnutie zjednoduší prvé dva týždne, ale neskôr čaká migrácia. Rozhodnúť v ADR (#44).
3. **Playwright v `standalone` image:** treba v walking skeletone overiť trace `playwright-core`, cestu k prehliadačom (`PLAYWRIGHT_BROWSERS_PATH`) a fonty so slovenskou diakritikou. Font odporúčame vložiť cez `@font-face` do šablóny, aby PDF nezáviselo od systémových fontov.
4. **Kódovanie CSV z Partslinku** (UTF-8 vs. Windows-1250) a formát exportu: neoverené, čaká na fixture [#63](https://github.com/Kazarr/Servisnik/issues/63).
5. **KROS podpis:** podpisuje sa surové telo, má hlavička prefix, aký je tvar secretu? To je otázka pre [#48](https://github.com/Kazarr/Servisnik/issues/48) a fixtures [#62](https://github.com/Kazarr/Servisnik/issues/62). Bez testovacieho prístupu (#61) sa to overiť nedá.
6. **HEIC z iPhonu:** prebuilt sharp HEIC nečíta. Spoliehame sa, že prehliadač dekóduje fotku do canvasu a pošle JPEG. Treba overiť na reálnom iPhone.
7. **Úložisko fotiek** (disk volume vs. S3-kompatibilné): závisí od hostingu [#47](https://github.com/Kazarr/Servisnik/issues/47).
8. **Prisma tag `latest` = RC:** ak by sa ADR predsa priklonil k Prisme, verziu treba pinovať (`prisma@7.10.1`). Pri Drizzle pinovať 0.45.x, kým 1.0 nebude stabilná.
9. **TypeScript 7.0:** je `latest`, ale šablóny frameworkov ešte pinujú 5.9. Držať verziu zo šablóny a TS 7 neriešiť pred odovzdaním.
10. **Better Auth × React Router 8:** integračná stránka uvádza len v7. Ak by vyhral RR, treba overiť v skeletone.
11. Nič z tohto research nevyžadovalo účet. Evaly Next.js sú od Vercelu, teda od výrobcu frameworku, a iný framework nemerajú, takže porovnanie agentov medzi frameworkami je nepriame.

## Zdroje

- Next.js: [blog](https://nextjs.org/blog), [16.4](https://nextjs.org/blog/next-16-4), [16.2 AI](https://nextjs.org/blog/next-16-2-ai), [evals](https://nextjs.org/evals), [authentication](https://nextjs.org/docs/app/guides/authentication), [auth s Cache Components](https://nextjs.org/docs/app/guides/authentication-with-cache-components), [route.js](https://nextjs.org/docs/app/api-reference/file-conventions/route), [serverActions](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions), [proxyClientMaxBodySize](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize), [serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages), [output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Vitest](https://nextjs.org/docs/app/guides/testing/vitest), [with-docker](https://github.com/vercel/next.js/tree/canary/examples/with-docker), [advisories](https://github.com/vercel/next.js/security/advisories)
- React Router: [changelog](https://reactrouter.com/changelog), [sessions and cookies](https://reactrouter.com/explanation/sessions-and-cookies), [file uploads](https://reactrouter.com/how-to/file-uploads), [resource routes](https://reactrouter.com/how-to/resource-routes), [testing](https://reactrouter.com/start/framework/testing), [templates](https://github.com/remix-run/react-router-templates), [agent-skills](https://github.com/remix-run/agent-skills), [create-react-router changelog](https://cdn.jsdelivr.net/npm/create-react-router@8.5.0/CHANGELOG.md), [form-data-parser](https://github.com/remix-run/remix/tree/main/packages/form-data-parser), [advisories](https://github.com/remix-run/react-router/security/advisories), [Wake up, Remix](https://remix.run/blog/wake-up-remix)
- ORM: [Drizzle migrations](https://orm.drizzle.team/docs/migrations), [Drizzle upgrade v1](https://orm.drizzle.team/docs/upgrade-v1), [Drizzle releases](https://github.com/drizzle-team/drizzle-orm/releases), [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/getting-started), [Prisma releases](https://github.com/prisma/prisma/releases)
- Auth: [Better Auth email-password](https://www.better-auth.com/docs/authentication/email-password), [options](https://www.better-auth.com/docs/reference/options), [admin plugin](https://www.better-auth.com/docs/plugins/admin), [database](https://www.better-auth.com/docs/concepts/database), [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle), [Next integration](https://www.better-auth.com/docs/integrations/next), [React Router integration](https://www.better-auth.com/docs/integrations/react-router), [basic usage](https://www.better-auth.com/docs/basic-usage)
- PDF: [Playwright Page.pdf](https://playwright.dev/docs/api/class-page#page-pdf) ([zdroj](https://github.com/microsoft/playwright/blob/main/docs/src/api/class-page.md)), [Docker](https://playwright.dev/docs/docker), [system requirements](https://playwright.dev/docs/intro), [browsers](https://github.com/microsoft/playwright/blob/main/docs/src/browsers.md)
- Import: [SheetJS install](https://docs.sheetjs.com/docs/getting-started/installation/nodejs), [parse options](https://docs.sheetjs.com/docs/api/parse-options), [sheet_to_json](https://docs.sheetjs.com/docs/api/utilities/array), [SheetJS CDN](https://cdn.sheetjs.com/)
- Fotky: [MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture), [sharp resize](https://sharp.pixelplumbing.com/api-resize), [sharp docs zdroj](https://github.com/lovell/sharp/tree/main/docs/src/content/docs)
- Webhook: [Node.js crypto](https://nodejs.org/api/crypto.html)
- Deploy: [GitHub Docs – publish Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [Node.js release schedule](https://github.com/nodejs/Release)
- Verzie: npm registry (`https://registry.npmjs.org/<balík>`) pre next, react, react-router, drizzle-orm, drizzle-kit, prisma, better-auth, playwright, exceljs, sharp, vitest, typescript, @sveltejs/kit
