# Research: Hosting testovacieho a produkčného prostredia

Ticket: [#47](https://github.com/Kazarr/Servisnik/issues/47) · vstup pre [#44 Rozhodnutie o stacku a architektúre](https://github.com/Kazarr/Servisnik/issues/44) · všetky ceny a fakty čítané **2026-10-21** z oficiálnych stránok poskytovateľov, ceny sú **bez DPH**.

## Otázka

Kde pobeží testovacie a produkčné prostredie Servisníka? Porovnať 2–3 hostingy, ktoré zvládnu Node aj .NET (cez Docker), so spravovaným PostgreSQL v EÚ a dennou zálohou, úložiskom súborov (fotky, PDF), vlastnou doménou s HTTPS, verejnou URL pre webhook KROS a deployom z GitHub Actions. Mesačná cena pre test aj produkciu a čo musí urobiť človek (registrácia, platba, DNS).

## Zhrnutie

- **Odporúčanie: DigitalOcean, región Frankfurt (FRA1)** – App Platform (Docker kontajner) + Managed PostgreSQL + Spaces (S3). Cca **$37/mes.** spolu (test $12, prod $25,15).
- Je to jediná porovnaná možnosť, kde spravovaná DB má doslova **dennú plnú zálohu + 7-dňový PITR** bez ďalšieho kódu (K10), súbory sú v S3 v tom istom regióne a appka ostáva bezstavová.
- **Render (Frankfurt)** je najlacnejší (~$30,55/mes.) a najjednoduchší, ale na pláne Hobby je PITR len 3 dni, logické zálohy len ručne a súbory na disku vypínajú zero-downtime deploy. 7 dní PITR stojí +$25/mes. (Pro).
- **Hetzner Cloud VPS + Docker + vlastný Postgres** je jediný EÚ-vlastnený poskytovateľ (najsilnejšia GDPR pozícia), ale DB, zálohy, TLS a aktualizácie OS si spravujeme sami. Od 2026-06-15 zdražil a lacná rada CX je dnes označená „not available“, takže stojí €30,48–42,47/mes.
- Dôsledok pre architektúru (#44): súbory ukladať cez **S3 API** (DO Spaces, Hetzner Object Storage aj iné S3 sú zameniteľné), nie na lokálny disk.
- Človek musí: založiť účet a zadať kartu, prepojiť GitHub, vytvoriť API token do GitHub secrets, potvrdiť DPA a nastaviť DNS u registrátora domény zákazníka.

## Zistenia

### Porovnanie v skratke

| Bod ticketu | DigitalOcean (FRA1) | Render (Frankfurt) | Hetzner Cloud VPS |
|---|---|---|---|
| Node aj .NET | Dockerfile build | Dockerfile build alebo image z registra | ľubovoľný Docker |
| Postgres v EÚ | Managed PG vo FRA1/AMS3 | Render Postgres vo Frankfurte | vlastný Postgres v kontajneri (DE/FI) |
| Denná záloha | denná plná + PITR 7 dní | PITR 3 dni (Hobby) / 7 dní (Pro), export ručne | denný snapshot disku (7 slotov) + vlastný `pg_dump` |
| Súbory | Spaces (S3), 250 GiB v cene | persistent disk, denný snapshot | Object Storage (S3), 1 TB v cene |
| Doména + HTTPS | CNAME/A, automatický certifikát | CNAME/A, automatický certifikát | A záznam + Caddy (Let's Encrypt) |
| Webhook URL | `*.ondigitalocean.app` cez HTTPS | `*.onrender.com` s TLS | potrebuje (sub)doménu |
| GitHub Actions | oficiálna action `app_action` | deploy hook / auto-deploy | SSH + `docker compose pull` |
| Test / mes. | $12,00 | $13,55 | €11,99 |
| Prod / mes. | $25,15 | $17,00 | €30,48 |
| **Spolu / mes.** | **$37,15** | **$30,55** | **€42,47** (alebo €30,48 na 1 serveri) |

### Možnosť A: DigitalOcean – App Platform + Managed PostgreSQL + Spaces (FRA1) – odporúčaná

- **Node aj .NET:** App Platform buildne image z Dockerfile v repe ([features](https://docs.digitalocean.com/products/app-platform/details/features/)). .NET dokumentácia výslovne neuvádza, beží však ako Docker image (odvodené).
- **EÚ región:** App Platform, Managed PostgreSQL, Spaces aj Droplety sú dostupné vo FRA1 aj AMS3 ([regional availability](https://docs.digitalocean.com/platform/regional-availability/)).
- **Spravovaný Postgres a denná záloha:** „Full cluster backups are taken daily“, WAL umožňuje obnovu do ľubovoľného bodu za posledných 7 dní ([PG features](https://docs.digitalocean.com/products/databases/postgresql/details/features/)). Najmenší uzol Basic 1 GiB RAM / 1 vCPU / 10 GiB disk stojí **$15,15/mes.**, ďalšie úložisko $0,215/GiB/mes. ([DB pricing](https://www.digitalocean.com/pricing/managed-databases)).
- **Test DB:** dev databáza v App Platform (512 MiB) stojí **$7/mes.** ([App pricing](https://www.digitalocean.com/pricing/app-platform)). DO ju neodporúča na produkciu a dá sa neskôr povýšiť na Managed DB. Zálohy dokumentácia neuvádza ([manage databases](https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/)).
- **Súbory:** lokálny filesystem je dočasný a „App Platform does not support volumes“ ([limits](https://docs.digitalocean.com/products/app-platform/details/limits/)), súbory teda musia ísť do Spaces. Spaces za **$5/mes.** obsahuje 250 GiB úložiska a 1 024 GiB odchádzajúceho prenosu pre všetky buckety a viac bucketov v jednom predplatnom ([Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/)). Test a prod tak môžu mať každý svoj bucket za jeden poplatok.
- **Kontajner:** najmenší platený `apps-s-1vcpu-0.5gb` (1 zdieľané vCPU, 512 MiB) za **$5/mes.**, bez škálovania na viac inštancií. 50 GiB prenosu sa sčítava za tím, nad limit $0,02/GiB ([App pricing details](https://docs.digitalocean.com/products/app-platform/details/pricing/)).
- **Doména + HTTPS:** CNAME na alias `…ondigitalocean.app`, pre apex A záznamy, ktoré App Platform poskytne. Certifikáty vydáva Let's Encrypt alebo Google Trust ([manage domains](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/)). Automatické SSL/TLS je medzi funkciami ([features](https://docs.digitalocean.com/products/app-platform/details/features/)).
- **Verejná URL pre webhook:** každá appka má predvolený ingress `<app-name>.ondigitalocean.app` cez HTTPS na porte 443 ([external CDN](https://docs.digitalocean.com/products/app-platform/how-to/configure-external-cdn/)), test teda nepotrebuje vlastnú doménu.
- **GitHub Actions:** oficiálna action `digitalocean/app_action/deploy@v2` s API tokenom (read/write pre App Platform) v secrets. Variant s imageom buildne Dockerfile, pushne do GHCR a nasadí ([deploy from GH Actions](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/)). Prvé nasadenie musí prebehnúť cez control panel alebo API, aby App Platform získal prístup ku GitHubu (tamže).
- **Konfigurácia ako kód:** celú appku (služby, databázy, domény, env premenné, región) opisuje YAML App Spec, ktorý sa nasadzuje cez API alebo `doctl` ([app spec](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)). Test a prod tak môžu byť dva spec súbory v repe namiesto klikania v paneli.
- **GDPR:** DPA je dodatok k Terms of Service. Prenos mimo EHP ide cez EU-U.S. Data Privacy Framework a pri jeho páde cez SCC 2021/914 ([DO DPA](https://www.digitalocean.com/legal/data-processing-agreement)).
- **Cena:** test = App $5 + dev DB $7 = **$12,00**. Prod = App $5 + Managed PG $15,15 + Spaces $5 = **$25,15**. **Spolu $37,15/mes.** Pri pridaní karty môže prebehnúť predautorizácia (zvyčajne $1), účtuje sa na konci cyklu ([Spaces pricing FAQ](https://www.digitalocean.com/pricing/spaces-object-storage)).

### Možnosť B: Render – Web Service (Docker) + Render Postgres (Frankfurt)

- **Node aj .NET:** Render buildne image z Dockerfile v repe alebo spustí hotový image z registra ([Docker](https://render.com/docs/docker)).
- **EÚ región:** Frankfurt je medzi regiónmi a región sa neskôr nedá zmeniť ([regions](https://render.com/docs/regions)).
- **Postgres a záloha:** PITR 3 dni na Hobby a 7 dní na Pro a vyššom. Logické zálohy sa robia ručne („Create export“) a držia sa 7 dní. Free DB nemá obnovu ani zálohy ([backups](https://render.com/docs/postgresql-backups)). Najmenšia platená DB `0.1c-256mb` stojí **$6/mes.**, `0.5c-1g` $19/mes., úložisko $0,30/GB ([pricing](https://render.com/pricing)). Úložisko je 1 GB alebo násobok 5 GB a nedá sa zmenšiť ([create DB](https://render.com/docs/postgresql-creating-connecting)).
- **Free plán nie je na test použiteľný:** free web service po 15 min bez prevádzky zaspí a štart trvá asi 1 min. Free Postgres expiruje po 30 dňoch. Free služby nevedia pripojiť disk a Render ich neodporúča na produkciu ([free](https://render.com/docs/free)).
- **Súbory:** persistent disk $0,25/GB/mes. ([pricing](https://render.com/pricing)) s automatickým snapshotom raz za 24 h, ktorý je dostupný aspoň 7 dní. Disk ale **vypína zero-downtime deploy** a službu nedá škálovať na viac inštancií ([disks](https://render.com/docs/disks)). Natívne objektové úložisko Render v cenníku nemá ([pricing](https://render.com/pricing)), alternatívou je externé S3.
- **Kontajner:** `0.5c-512mb` za **$7/mes.**. Workspace Hobby stojí $0 + compute, má 1 seat, 2 prostredia na projekt, 5 GB prenosu (potom $0,15/GB) a 2 vlastné domény ([pricing](https://render.com/pricing)).
- **Doména + HTTPS:** CNAME na `…onrender.com`, apex cez ALIAS/ANAME alebo A `216.24.57.1`, AAAA záznamy treba odstrániť ([other DNS](https://render.com/docs/configure-other-dns)). TLS sa vydáva a obnovuje automaticky (Let's Encrypt, Google Trust) ([custom domains](https://render.com/docs/custom-domains)).
- **Verejná URL pre webhook:** každá web service má subdoménu `onrender.com` s managed TLS ([web services](https://render.com/docs/web-services)).
- **GitHub Actions:** auto-deploy pri pushe do prepojenej vetvy ([web services](https://render.com/docs/web-services)) alebo deploy hook (tajná URL v secrets, `curl` z workflow, `imgURL` pre konkrétny tag image) ([deploy hooks](https://render.com/docs/deploy-hooks)).
- **GDPR:** DPA dopĺňa Terms of Service. Prenos mimo EHP ide cez Data Privacy Framework a záložne cez EU SCC ([Render DPA](https://render.com/dpa)).
- **Cena (Hobby):** test = $7 + DB $6 + 1 GB × $0,30 + disk 1 GB × $0,25 = **$13,55**. Prod = $7 + DB $6 + 5 GB × $0,30 + disk 10 GB × $0,25 = **$17,00**. **Spolu $30,55/mes.** S workspace Pro (PITR 7 dní) je to +$25 → $55,55.

### Možnosť C: Hetzner Cloud VPS + Docker Compose + vlastný PostgreSQL

- **Node aj .NET:** ľubovoľné Docker kontajnery na Linuxe (Ubuntu, Debian a ďalšie) ([cost-optimized](https://www.hetzner.com/cloud/cost-optimized)).
- **EÚ región:** eu-central FSN1, NBG1 (Nemecko) a HEL1 (Fínsko) ([regular performance](https://www.hetzner.com/cloud/regular-performance)). Dátové centrá sú vo Falkensteine, Norimbergu a Helsinkách ([data protection](https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/)).
- **Postgres a záloha:** spravovanú DB Hetzner Cloud v cenníku nemá, Postgres beží ako kontajner a spravujeme ho sami. Server Backups sa robia denne, je 7 slotov a najstarší sa prepíše ([backups](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview)). Stoja 20 % ceny servera ([billing FAQ](https://docs.hetzner.com/cloud/billing/faq/)). Konzistenciu snapshotu pre DB dokumentácia neuvádza, preto treba denný `pg_dump` (ten „makes consistent exports even if the database is being used concurrently“, [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)) cronom do Object Storage.
- **Súbory:** Object Storage (S3) vo FSN1/HEL1/NBG1 za **€6,49/mes.** vrátane 1 TB úložiska a 1 TB odchádzajúceho prenosu, prichádzajúci prenos a API volania sú zadarmo ([object storage](https://www.hetzner.com/storage/object-storage)).
- **Servery (ceny vrátane IPv4):** Cost-Optimized CX23 (2 vCPU, 4 GB, 40 GB) je za €5,99, ale celá rada CX/CAX je dnes na stránke označená **„not available“** ([cost-optimized](https://www.hetzner.com/cloud/cost-optimized)). Regular Performance: CPX12 (1 vCPU, 2 GB, 40 GB) **€11,99**, CPX22 (2 vCPU, 4 GB, 80 GB) **€19,99**, 20 TB prenosu v cene ([regular performance](https://www.hetzner.com/cloud/regular-performance)). Ceny zvýšil cenník platný od 2026-06-15 (napr. CX23 z €3,99 na €5,49 bez IPv4) ([price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)). Firewall je zadarmo ([cost-optimized](https://www.hetzner.com/cloud/cost-optimized)).
- **Doména + HTTPS:** A záznam na IP servera a reverse proxy Caddy, ktorý certifikát (Let's Encrypt/ZeroSSL) získa aj obnovuje sám a presmeruje HTTP na HTTPS, ak sú otvorené porty 80/443 ([Caddy](https://caddyserver.com/docs/automatic-https)).
- **Verejná URL pre webhook:** bez domény nie je. Aj test potrebuje (sub)doménu s A záznamom, aby Caddy vydal certifikát (tamže).
- **GitHub Actions:** build image → GHCR → SSH na server → `docker compose pull && up -d`. GHCR je pre verejné balíčky zadarmo ([Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)).
- **GDPR:** Hetzner Online GmbH (EÚ). DPA podľa čl. 28 sa uzatvára checkboxom v zákazníckom účte (`accounts.hetzner.com/account/dpa`) ([data protection](https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/)).
- **Cena:** variant 2 servery: test CPX12 €11,99 + prod CPX22 €19,99 + Backups 20 % €4,00 + Object Storage €6,49 = **€42,47/mes.** Variant 1 server CPX22 pre test aj prod (dva compose stacky) = **€30,48/mes.** Ak bude CX23 znova dostupný, 2 servery vyjdú na €19,67.

### Spoločné

- Repo `Kazarr/Servisnik` je verejné, preto GitHub Actions na štandardných GitHub-hosted runneroch nič nestojí ([Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). GHCR je pre verejné balíčky tiež zadarmo ([Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)).

## Čo musí urobiť človek

Pre odporúčanú možnosť (DigitalOcean). Agent nič z toho neurobí, lebo ide o registráciu, platbu, súhlas s podmienkami a OAuth.

1. **Rozhodnúť vlastníka účtu:** kto platí a vlastní produkciu, Kazarr alebo zákazník (pozri otvorené otázky).
2. **Registrácia:** založiť účet na digitalocean.com, zapnúť 2FA, prijať ToS (DPA je jeho dodatok) a pridať platobnú kartu (môže prebehnúť predautorizácia ~$1).
3. **Prepojiť GitHub:** pri vytvorení prvej appky autorizovať prístup DigitalOcean ku `Kazarr/Servisnik` (OAuth) a nasadiť appku prvýkrát cez control panel.
4. **Vytvoriť zdroje vo FRA1:** appka `servisnik-test` (+ dev DB), appka `servisnik-prod`, Managed PostgreSQL cluster (Basic 1 GiB), Spaces bucket pre test a pre prod a Spaces access key.
5. **Secrets:** vytvoriť DO API token (read/write App Platform) a uložiť ho do GitHub repo secrets. Spaces kľúče a `DATABASE_URL` nastaviť ako env premenné appiek.
6. **DNS u registrátora domény zákazníka:** CNAME pre subdoménu (napr. `servis.<domena>.sk`) na alias `…ondigitalocean.app`. Pre apex použiť A záznamy z App Platform. Ak doména má CAA, povoliť Let's Encrypt a Google Trust.
7. **KROS:** zaregistrovať webhook URL (test `…ondigitalocean.app`, prod vlastná doména) v KROS Fakturácii, ak to KROS vyžaduje ručne (pozri research KROS API).

Pri Renderi sú kroky rovnaké (účet, karta s $1 overovacou platbou, ktorá sa vráti ([pricing FAQ](https://render.com/pricing)), GitHub, DNS). Pri Hetzneri navyše treba objednať server, nastaviť SSH kľúč do secrets, A záznamy pre test aj prod a DPA checkbox v účte.

## Riziká a otvorené otázky

- **Vlastník a platiteľ účtu** (Kazarr alebo zákazník): určuje, na koho je DPA, kto vidí dáta a kto platí v USD kartou. Treba rozhodnúť pred K10.
- **Doména zákazníka:** kto je registrátor a či DNS podporuje CNAME flattening alebo ALIAS na apex. Odporúčaná je subdoména (CNAME je najjednoduchší). Skutočný názov firmy a domény je otázka 1 v [#43](https://github.com/Kazarr/Servisnik/issues/43).
- **Webhook KROS:** timeout, opakovanie, podpis a prípadný IP allowlist nie sú známe (research KROS API). Cold start free tieru (Render ~1 min) by webhook mohol zhodiť, preto ani test nemá byť na free.
- **Retencia záloh:** DO aj Render Pro držia 7 dní, Render Hobby 3 dni. Ak zákazník chce dlhšiu retenciu (napr. 30 dní), treba navyše plánovaný `pg_dump` do S3. K10 to nevyžaduje.
- **Výkon 512 MiB kontajnera** pre .NET aj Node treba overiť na walking skeletone. Ďalší krok je 1 GiB za $10–12/mes. ([App pricing](https://www.digitalocean.com/pricing/app-platform)).
- **Dev DB na DO** nemá zdokumentované zálohy. Pre test to nevadí, testovacie dáta sú zahoditeľné.
- **Obnova certifikátov** na štandardných vlastných doménach DO v čítanej dokumentácii nie je popísaná, uvádza sa len automatické SSL/TLS. Overiť po nasadení.
- **US poskytovateľ (DO, Render):** dáta ostávajú v EÚ regióne, ale prenos (support, subprocesori) ide cez DPF/SCC. Ak zákazník trvá na EÚ-vlastnenom poskytovateľovi, voľba je Hetzner (možnosť C) s vyššou prevádzkovou záťažou. EÚ PaaS so spravovaným Postgresom (napr. Scaleway) sa neporovnával.
- **Hetzner:** dôvod a trvanie stavu „not available“ pri rade CX/CAX stránka neuvádza. Prípadné overenie identity pri registrácii a limity nového účtu sa dajú zistiť len s účtom.
- **Render Postgres úložisko:** cenník uvádza aj „1 GB SSD storage included“ aj „$0,30/GB“. Vo výpočte je 1 GB započítaný ako platený (horný odhad).
- **DPH:** všetky ceny sú bez DPH. Ako sa DPH uplatní (IČ DPH, reverse charge) závisí od platiteľa, neoverené.
- **.NET** výslovne nespomína ani DO, ani Render. Oba spúšťajú Dockerfile, takže .NET beží ako kontajner (odvodené, overiť pri walking skeletone).

## Zdroje

Všetky čítané 2026-10-21.

- DigitalOcean: [App Platform pricing](https://www.digitalocean.com/pricing/app-platform), [App Platform pricing details](https://docs.digitalocean.com/products/app-platform/details/pricing/), [App Platform features](https://docs.digitalocean.com/products/app-platform/details/features/), [App Platform limits](https://docs.digitalocean.com/products/app-platform/details/limits/), [Manage domains](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/), [External CDN / default ingress](https://docs.digitalocean.com/products/app-platform/how-to/configure-external-cdn/), [Deploy from GitHub Actions](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/), [Manage databases (dev DB)](https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/), [App Spec](https://docs.digitalocean.com/products/app-platform/reference/app-spec/), [Managed Databases pricing](https://www.digitalocean.com/pricing/managed-databases), [PostgreSQL features (backups)](https://docs.digitalocean.com/products/databases/postgresql/details/features/), [Spaces pricing](https://www.digitalocean.com/pricing/spaces-object-storage), [Spaces pricing details](https://docs.digitalocean.com/products/spaces/details/pricing/), [Regional availability](https://docs.digitalocean.com/platform/regional-availability/), [DPA](https://www.digitalocean.com/legal/data-processing-agreement)
- Render: [Pricing](https://render.com/pricing), [Regions](https://render.com/docs/regions), [Free instances](https://render.com/docs/free), [Postgres backups](https://render.com/docs/postgresql-backups), [Create Postgres](https://render.com/docs/postgresql-creating-connecting), [Persistent disks](https://render.com/docs/disks), [Docker](https://render.com/docs/docker), [Web services](https://render.com/docs/web-services), [Custom domains](https://render.com/docs/custom-domains), [Other DNS providers](https://render.com/docs/configure-other-dns), [Deploy hooks](https://render.com/docs/deploy-hooks), [DPA](https://render.com/dpa)
- Hetzner: [Cloud Cost-Optimized](https://www.hetzner.com/cloud/cost-optimized), [Cloud Regular Performance](https://www.hetzner.com/cloud/regular-performance), [Object Storage](https://www.hetzner.com/storage/object-storage), [Backups & Snapshots](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview), [Billing FAQ](https://docs.hetzner.com/cloud/billing/faq/), [Price adjustment 2026-06-15](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [Data protection / DPA](https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/)
- Ostatné: [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https), [PostgreSQL pg_dump (v18)](https://www.postgresql.org/docs/current/app-pgdump.html), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [GitHub Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)
