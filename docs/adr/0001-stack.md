# Stack: TypeScript, Next.js a modulárny monolit

Servisník stavajú AI agenti a ZÁKLAD sa odovzdáva 2026-11-04. Preto rozhoduje, ako spoľahlivo agenti v stacku doručujú, a či biznis logika beží v unit testoch bez frameworku, databázy a siete. Volíme TypeScript: Next.js 16.4 (App Router, Node runtime, `output: 'standalone'`), Drizzle ORM 0.45 nad PostgreSQL 17, Better Auth 1.7, Playwright (PDF aj e2e), SheetJS CE 0.20.3, sharp a Vitest 5 na Node 24 LTS v pnpm workspace. Next.js je jediný porovnávaný framework so zmeranou spoľahlivosťou agentov: Claude Code s Opus 5.5 má 97 % (pass@4, 35 úloh, beh 2026-10-13, [nextjs.org/evals](https://nextjs.org/evals)). Kazarr ho pozná.

## Considered Options

| Kritérium | Next.js 16.4 (zvolené) | React Router 8.5 | .NET 10 + Razor Pages |
|---|---|---|---|
| Spoľahlivosť agentov | zmeraná, 97 % (evaly robí výrobca, iné frameworky nemeria) | nezmeraná, v8 vyšiel 2026-06 | nezmeraná, model sa nemení od .NET 7 |
| Doména bez frameworku a DB | samostatný balík bez závislostí (pnpm nevyrieši nedeklarovaný import) | rovnako | samostatný projekt, stráži kompilátor |
| Stránky a role v ticket tieri | Vitest nevie async Server Components, preto Data Access Layer a e2e | loader a action sa dajú volať ako funkcie | `WebApplicationFactory` in-memory |
| PDF / xlsx a csv / HMAC | Playwright / SheetJS / `node:crypto` | rovnako | Gotenberg / ExcelDataReader / `HMACSHA256` |
| Bezpečnostné advisories za rok | 48 (6 critical) | 19 (1 critical) | LTS, mesačné záplaty |

Podklady: [Research: TypeScript full-stack](https://github.com/Kazarr/Servisnik/issues/45), [Research: .NET](https://github.com/Kazarr/Servisnik/issues/46), [Research: Hosting](https://github.com/Kazarr/Servisnik/issues/47), [Research: KROS Fakturácia API](https://github.com/Kazarr/Servisnik/issues/48). Pri testovateľnosti .NET vedie len v testoch stránok bez prehliadača a to vyrovná Data Access Layer. Rozhodla zmeraná spoľahlivosť agentov a to, že Kazarr Next.js pozná.

## Consequences

- **Modulárny monolit, nie mikroslužby.** Jedno nasadenie na jeden autoservis, bez `tenant_id`. Balíky: `apps/web` (Next.js s tenkými adaptérmi), `packages/domain` (pravidlá Servisníka, priečinok pre každú oblasť glosára, oblasti sa volajú len cez `index.ts`, žiadne runtime závislosti) a `packages/kros` (klient KROS API, ktorý Servisník nepozná; `economy/` pokrýva Fakturáciu aj Sklad, ktoré zdieľajú API a token). Kód bez pojmov z glosára dostane vlastný balík a inde sa prepoužije vendorovaním; malí pomocníci bez pojmu z glosára, ktorých používa len doména (dátumy, parsery čísel), ostanú v doméne, aby nemala závislosti (#131). Mikroslužby by pri jednom vývojárovi a jednom zákazníkovi pridali len sieť, distribuovanú transakciu medzi zákazkou a faktúrou a kontajner navyše za každú službu.
- **Data Access Layer.** Stránky čítajú dáta len cez funkcie, ktoré dostanú používateľa a vrátia iba to, čo smie vidieť (mechanik nevidí ceny). Testujú sa proti skutočnému PostgreSQL cez Testcontainers. Server Actions sú verejné endpointy: prístup sa overuje v nich, nikdy len v `proxy.ts`.
- **Pasce Next.js.** Cache Components sú vypnuté (`cacheComponents: false`), lebo v ERP je každá stránka per-používateľ. Next 17 ich zapne ako predvolené, migrácia príde po odovzdaní. Upload (import, fotky), webhook a PDF idú cez Route Handlers: Server Actions majú limit 1 MB a `proxy.ts` potichu oreže telo nad 10 MB. `images.unoptimized: true`. Bezpečnostné záplaty Next.js do niekoľkých dní.
- **Knižnice.** Drizzle je pinovaný na 0.45.x (1.0 je RC) a migrácie sú SQL súbory v repe. Better Auth vlastní schému používateľov: `pouzivatel` z K01 sa na ňu mapuje a aktívny = nie `banned` (admin plugin). TypeScript ostáva na 5.9 ako v šablónach frameworkov.
- **Image na Debiane** (`node:24-slim`), nie Alpine, lebo Playwright Alpine nepodporuje. Chromium je v image appky, PDF sa tlačí s formátom A4 (predvolený je Letter). Image má s Chromiom 963 MB a nesmie narásť tak, aby potreboval silnejšiu a drahšiu inštanciu: závislosť, ktorá ho citeľne zväčší, schvaľuje Kazarr (#129).
- **KROS.** Podpis webhooku je HMAC-SHA256 nad UTF-16LE a `409` sa neopakuje (pozri research KROS).
- **Práca na pozadí** (načítanie úhrad, záložný polling za stratený webhook) beží v procese appky, lebo inštancia je jedna.
- **Prostredia.** Vývoj a testy bežia lokálne v Docker Compose (PostgreSQL 17, MinIO ako S3). Webhooky KROS sa nahrávajú cez Cloudflare quick tunnel bez účtu. Hosting je DigitalOcean FRA1 (App Platform, Managed PostgreSQL, Spaces) na účte Kazarra. Testovacie prostredie sa zakladá až vtedy, keď má zákazník appku vidieť, produkcia po kúpe. App Platform nemá volumes, súbory idú len cez S3 API. Výnimka: logo autoservisu je v PostgreSQL ako `bytea` v tabuľke `workshop_logo`, oddelenej od `workshop`, aby čítanie Nastavení nenačítalo obrázok. Je to jeden malý súbor (PNG alebo JPEG do 1 MB), ktorý sa zálohuje spolu s databázou (K10), a S3 príde až s fotkami (R4). Konfigurácia ide len cez env premenné a App Spec v repe, takže presun na účet zákazníka je nové nasadenie zo specu a zmena DNS.
