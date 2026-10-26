# Servisnik
Jednoduchý ERP systém pre autoservisy: zákazky, zákazníci, vozidlá, sklad a faktúry na jednom mieste. Servisník: odľahčený ERP pre automechanikov. Bez zbytočností, len to, čo dielňa denne potrebuje.

## Lokálne prostredie

Treba Docker Desktop, Node 24 a pnpm. PostgreSQL 17 a MinIO (S3) bežia v Docker Compose, prístupy sú v `.env` (mimo gitu).

```powershell
Copy-Item .env.example .env   # raz
pnpm services:up              # PostgreSQL :5432, MinIO :9000, konzola :9001
pnpm services:down            # dáta ostanú vo volumes; `docker compose down -v` ich zmaže
pnpm tunnel                   # verejná https://*.trycloudflare.com -> TUNNEL_TARGET; Ctrl+C ho zastaví
```

Tunel je Cloudflare quick tunnel bez účtu pre webhook KROS. URL sa mení pri každom spustení, nájdeš ju vo výpise `pnpm tunnel`.
