# Research: KROS Fakturácia API

Ticket: [#48](https://github.com/Kazarr/Servisnik/issues/48) · vstup pre [K09 #34](https://github.com/Kazarr/Servisnik/issues/34) a [#62](https://github.com/Kazarr/Servisnik/issues/62) · stav zdrojov k 2026-10-21

## Otázka

Ako sa Servisník napojí na KROS Fakturáciu: sandbox a licencia (chyba 402) a jej cena, presný tvar `POST /api/invoices` a jeho odpovedí (202 + `requestId`, 400, 401, 402, 409, 429), tvar webhooku a overenie `X-Kros-Signature-256`, PDF faktúry a stav úhrady, limity API a pravidlo 120 s, odoslanie eFaktúry cez `isEInvoice`.

## Zhrnutie

- Jediné prostredie je produkčné `https://api-economy.kros.sk`. **Sandbox neexistuje.** Testuje sa na samostatnej testovacej firme v KROS účte ([zaciname][dev-start], [spec][spec]).
- API vyžaduje platený doplnok **API prepojenie: 4,90 €/mes.** k balíku Základ (5,90 €) alebo Štandard (11,00 €). V KROS Firma (14,90 €) je zahrnutý. Ceny sú bez DPH pri ročnej platbe. Bez licencie API vráti `402` ([cenník][cennik], [chyby][dev-err]).
- `POST /api/invoices` berie `{ "data": Invoice }`, povinné sú `issueDate` a **`vatPayerType`** (K09 ho nemá). Odpoveď `202 { requestId }` znamená iba „prijaté“, výsledok príde webhookom ([spec][spec], [chyby][dev-err]).
- Podpis webhooku je HMAC-SHA256 v Base64, ale **kľúč aj telo sa kódujú ako UTF-16LE**, nie UTF-8 ([doc §6][doc-sig], [webhooky][dev-wh]).
- **`409` neznamená „skús znova“.** Identická požiadavka už bola prijatá. Bez `documentNumber` by opakovanie po 120 s založilo **druhú faktúru** ([doc §4][doc-resp], [čo API umožňuje][dev-co]).
- **eFaktúru API dnes neodošle.** `isEInvoice: true` faktúru iba označí. Odoslanie do siete Peppol spustí človek v aplikácii KROS, odoslanie cez API je „pripravujeme“. Podmienkou je vyplnené **DIČ** (`partner.taxId`), nie IČO ([eFaktúra][dev-efa]).
- PDF sa sťahuje cez `GET /api/invoices/{id}/reports/{17|19|101}` s tokenom. Stav úhrady je `paymentStatus` s 5 hodnotami a môže prísť aj webhookom o úhradách, ak sa zapne v nastaveniach ([spec][spec], [doc §3.2][doc-det]).

## Zistenia

### 1. Sandbox, licencia (402) a cena

**Prostredia.** Base URL je `https://api-economy.kros.sk`, endpointy sú pod `/api/{resource}`. Dokumentácia neuvádza žiadne testovacie ani sandbox prostredie ([doc §2][doc-auth], [zaciname][dev-start]). Spec nemá pole `servers` a „Try it out“ v Swaggeri volá produkčné API s reálnym tokenom ([spec][spec], [api reference][dev-ref]). Test, staging a produkčné hostname sú spomenuté iba pre partnerov modelu Token Broker, ktorí ich dostanú od KROS po dohode. Pre Servisník to neplatí ([token broker][dev-broker]).

**Testovacia firma.** Pod jedným kontom môže byť viac firiem a balík sa kupuje na každé IČO zvlášť ([KROS Fakturácia FAQ][fakt]). Každá firma má vlastný bezplatný balík ([cenník][cennik]). KROS ponúka 30-dňovú skúšobnú verziu „so všetkými dostupnými funkciami“, spustiteľnú po registrácii a založení firmy na fakturacia.kros.sk ([FAQ][fakt]). **Neoverené:** či skúšobná verzia obsahuje doplnok API prepojenie a či sa dá spustiť pre druhú, testovaciu firmu (pozri Otvorené otázky).

**Licencia a 402.** Na API treba účet v KROS Fakturácii alebo KROS Sklade a licenciu na prístup k API ([zaciname][dev-start]). Kód `402 Payment Required` znamená „firma s nedostatočnou alebo vypršanou licenciou“ ([doc §4][doc-resp], [chyby][dev-err]). Rate limit sa uplatní iba na autorizované požiadavky ([chyby][dev-err]).

**Cena** (cenník stiahnutý 2026-10-21; predchádzajúci cenník Fakturácie platil do 30. 9. 2026 podľa [archívu cenníkov][cenniky]). Všetky ceny sú mesačné, bez DPH, pri platbe na 12 mesiacov ([cenník][cennik]):

| Balík | Cena | API prepojenie | Poznámka |
|---|---|---|---|
| Zadarmo | 0 € | nie | iba pre neplatiteľov DPH, 5 partnerov |
| Základ | 5,90 € (s kódom KROS30 4,13 €) | voliteľne **+4,90 €** | neobmedzený počet partnerov, fakturácia s DPH, automatické úhrady, QR kód |
| Štandard | 11,00 € (7,70 €) | voliteľne **+4,90 €** | navyše cenové ponuky, dodacie listy, objednávky |
| KROS Firma | 14,90 € (10,43 €) | **zahrnuté** | doklady, sklad, výdavky, prehľady |

Minimum pre platiteľa DPH s API je teda Základ + API prepojenie = **10,80 €/mes.**, čo pri ročnej platbe robí 129,60 € bez DPH. eFaktúry: 50 odoslaných mesačne zadarmo na zákaznícke číslo, potom balík 50 ks za 5,90 € alebo 2000 ks za 59,90 €, oba platné 12 mesiacov. Príjem eFaktúr je neobmedzený ([cenník][cennik]).

### 2. `POST /api/invoices`: request a odpovede

Autorizácia: hlavička `Authorization: Bearer <token>`, telo v JSON a UTF-8 ([doc §2–3][doc-auth]). Request je `InvoiceApiRequestBody = { "data": Invoice }` s `additionalProperties: false` ([spec][spec]). Hromadná varianta `POST /api/invoices/batch` berie `{ "data": Invoice[] }`, najviac 100 dokladov ([spec][spec], [doc §3][doc-ep]).

**Polia `Invoice`, ktoré Servisník potrebuje** (podľa [spec][spec]; povinné sú iba `issueDate` a `vatPayerType`):

| Pole | Typ / limit | Význam |
|---|---|---|
| `vatPayerType` | int, **povinné**: 0 = NonPayer, 1 = Payer, 2 = RegisteredVatPayer7 | typ platiteľa DPH dodávateľa |
| `issueDate` | `date`, **povinné** | dátum vystavenia (UTC) |
| `deliveryDate`, `dueDate` | `date`, nullable | dátum dodania, dátum splatnosti |
| `externalId` | string ≤ 255 | vlastné ID dokladu (napr. ID zákazky) |
| `orderNumber` | string ≤ **20** | číslo objednávky (číslo zákazky), filtrovateľné v `GET /api/invoices` |
| `documentNumber` | string ≤ 20 | prázdne alebo vynechané = číslo pridelí KROS z číselného radu |
| `numberingSequence` | string ≤ 5 | kód číselného radu (`GET /api/numberingSequences`) |
| `variableSymbol` | string ≤ 100 | vynechané = odvodí sa z čísla dokladu, `""` = bez VS |
| `isEInvoice` | bool | pozri kapitolu 6 |
| `partner` | `Partner`, `address` povinné | `registrationId` (IČO), `taxId` (DIČ), `vatId` (IČ DPH), všetky ≤ 20; `email` ≤ 255; `phoneNumber` ≤ 40; `address`/`postalAddress` = `{businessName, contactName, street, postCode, city, country}` |
| `items[]` | `DocumentItem` | povinné `amount` (decimal 15,6) a `totalPriceInclVat` (decimal 15,6; jednotkovú cenu dopočíta KROS); ďalej `name` ≤ 255, `description` ≤ 4000, `measureUnit` ≤ 50, `vatRate` (vynechať pri neplatiteľovi), `discountPercent`, `itemCode`, `warehouseCode`, `stockItemType` |
| ďalšie | | `paymentType` ≤ 30, `bankAccount {iban, swift, …}`, `printedNote` ≤ 255, `internalNote` ≤ 300, `currency`, `culture` (sk-SK, en-GB, de-DE), `invoiceType` (0 faktúra, 1 dobropis, 2 faktúra na úhradu, 3 ťarchopis), `myCompany`, `tags`, `customFields` |

Príklad pre Servisník. Hodnoty sú ilustračné a `vatRate` je zatiaľ neoverený (pozri Otvorené otázky):

```http
POST https://api-economy.kros.sk/api/invoices
Authorization: Bearer <token>
Content-Type: application/json

{
  "data": {
    "externalId": "zakazka-1234",
    "orderNumber": "Z-2026-0042",
    "vatPayerType": 1,
    "issueDate": "2026-10-21",
    "deliveryDate": "2026-10-21",
    "dueDate": "2026-11-04",
    "isEInvoice": true,
    "partner": {
      "registrationId": "12345678",
      "taxId": "2020123456",
      "vatId": "SK2020123456",
      "email": "mail@firma.sk",
      "address": { "businessName": "Firma s.r.o.", "street": "Ulica 1", "postCode": "01001", "city": "Mesto", "country": "Slovensko" }
    },
    "items": [
      { "name": "Výmena oleja", "amount": 1, "measureUnit": "ks", "vatRate": 23, "totalPriceInclVat": 61.5 }
    ]
  }
}
```

**Odpovede** ([spec][spec], [doc §4][doc-resp], [chyby][dev-err]):

| Kód | Telo | Čo urobiť |
|---|---|---|
| `202` | `{ "requestId": "uuid" }`; hlavičky `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset` | uložiť `requestId` a čakať na webhook; 202 ešte neznamená úspech |
| `400` | `{ "isValid": false, "errors": [{ "documentIndex": 0, "propertyPath": "items[0].amount", "errorMessage": "…" }], "requestId": "uuid", "partiallyValid": false }` | zobraziť `propertyPath` a `errorMessage`, neopakovať |
| `401` | bez tela | neplatný alebo chýbajúci token, neopakovať |
| `402` | bez tela | nedostatočná alebo vypršaná licencia, neopakovať |
| `409` | `{ "isDuplicateRequest": true, "retryAfter": 37, "requestId": "uuid" }` | identická požiadavka už bola prijatá (202) v posledných 120 s; pozri kapitolu 5 |
| `429` | bez tela; hlavička `retry-after` (sekundy) | počkať `retry-after`, potom opakovať |
| `405` | | endpoint nie je podporovaný alebo je vo vývoji ([doc §4][doc-resp]) |

**Upsert.** POST faktúry zároveň vytvára aj aktualizuje. Ak dvojica `documentNumber` a `numberingSequence` už existuje, KROS **celý** doklad prepíše a vynechané polia vyprázdni. Bez `documentNumber` vznikne vždy **nový** doklad ([doc §3.1][doc-ep], [čo API umožňuje][dev-co]). Prepis zlyhá, ak je doklad zamknutý (export do účtovníctva, uzávierka DPH, odoslaná eFaktúra) alebo nejednoznačný ([čo API umožňuje][dev-co]).

**Partner** sa založí automaticky. Právnická osoba sa páruje podľa IČO, DIČ a IČ DPH, potom podľa mena a adresy. Fyzická osoba sa páruje podľa mena a e-mailu, takže malá odchýlka založí duplicitného partnera ([doc §3.1][doc-ep], [e-shop][dev-eshop]).

### 3. Webhook a overenie `X-Kros-Signature-256`

**Nastavenie.** URL sa zadáva v KROS Fakturácii: Nastavenia firmy → API prepojenia → „URL pre príjem notifikácií z API“. Pole je voliteľné a v tom istom formulári je aj voliteľný „Autorizačný kľúč“ na overenie podpisu ([doc §2][doc-auth], [manuálny token][dev-token]). Pre všetky tri eventy je jedna URL a rozlišujú sa poľom `entityType`: 1 = doklad, 2 = úhrada dokladu, 3 = transakcia vo Financiách ([webhook spec][wh-spec], [webhooky][dev-wh]). Notifikácie o úhradách treba zapnúť voľbou „Notifikácie o úhradách do API“ ([doc §3.2][doc-det]).

**Telo po spracovaní faktúry** (`DocumentCallbackPayload`, callback „Invoice upload finished“ v [spec][spec]):

```json
{
  "companyId": 5587,
  "entityType": 1,
  "results": {
    "entities": [{
      "index": 0,
      "source": 1,
      "operation": 1,
      "status": 201,
      "data": { "id": 159, "numberingSequence": "OF", "documentNumber": "2022155", "externalId": "zakazka-1234", "documentType": 2 },
      "problems": null
    }],
    "relatedEntityType": 1,
    "relatedEntities": []
  },
  "status": 200,
  "apiUrl": "http://example/endpoint/{id}",
  "requestId": "uuid z odpovede 202"
}
```

- Vrchný `status`: `200` = všetko prebehlo, **`207` = čiastočné zlyhanie**, detaily sú v `entities[].problems` ([doc §5][doc-wh], [webhooky][dev-wh]).
- `entities[].status`: `201` = nový doklad, `204` = prepísaný alebo vymazaný, `400` = entita neprešla ([webhooky][dev-wh]).
- `operation`: 1 = Create, 2 = Update, 3 = Delete. `source`: 1 = OpenAPI, 2 = zmena používateľom v aplikácii KROS. Webhook teda chodí aj pri ručnej úprave alebo zmazaní faktúry v KROS. Pri takých eventoch je `requestId` `null` ([webhook spec][wh-spec]).
- `problems[]` = `{ type, title, detail }`, typy sú `…/problems/resource-locked`, `…/problems/id-conflict` a `…/duplicate-document-number` ([doc §5.1][doc-wh]).
- `data.id` je KROS ID faktúry (`kros_id`) a `documentNumber` je pridelené číslo faktúry ([spec][spec]).
- Odpoveď Servisníka: `200` = prijaté. Pri `400` KROS **neopakuje**. Pri `500` urobí **2 opakovania** ([spec][spec], [webhook spec][wh-spec]).

**Podpis.** Hlavička `X-Kros-Signature-256` nesie Base64 z HMAC-SHA256 nad telom notifikácie. Kľúčom je „Autorizačný kľúč“ z nastavení, odporúčaná dĺžka je 256 bitov. **Kľúč aj telo sa pred výpočtom kódujú ako UTF-16LE** ([doc §6][doc-sig], [webhook spec][wh-spec]). Pri UTF-8 výpočet prebehne bez chyby, ale podpis nikdy nesedí ([webhooky][dev-wh]). Oficiálny príklad v C#:

```csharp
var hash = new HMACSHA256(Encoding.Unicode.GetBytes(webHookSecret));
return Convert.ToBase64String(hash.ComputeHash(Encoding.Unicode.GetBytes(payload)));
```

Ekvivalent pre Node z [webhooky][dev-wh]: `crypto.createHmac('sha256', Buffer.from(secret, 'utf16le')).update(Buffer.from(rawBody, 'utf16le')).digest('base64')`. Porovnávať sa má funkciou s konštantným časom. Hash sa počíta z **pôvodného textu tela**, nie z JSON-u serializovaného nanovo.

### 4. PDF faktúry a stav úhrady

**PDF** ([spec][spec]):
- `GET /api/invoices/{id}/reports/{reportId}` vráti PDF na stiahnutie. `reportId` je **17** (čiernobiele), **19** (farebné) alebo **101** (editovateľná zostava). Odpovede: 200, 400, 401, 402, 429.
- `GET /api/invoices/{id}/reports/{reportId}/previewLink` vráti „URL na náhľad PDF“, no spec tvar odpovede nedefinuje.
- `InvoiceResponse.pdfReportLink` je odkaz na PDF zostavu.
- Oba endpointy vyžadujú Bearer token, takže PDF sa do prehliadača nedá dať priamo. Servisník ho musí sťahovať a podávať sám, alebo použiť previewLink (jeho platnosť je neoverená).

**Stav úhrady.** `GET /api/invoices/{id}` vráti `{ "data": InvoiceResponse }` ([spec][spec]):
- `paymentStatus`: 0 = NotPaid, 1 = FullyPaid, 2 = OverPaid, 3 = PartiallyPaid, -1 = Undefined.
- `sumOfPayments`, `countOfPayments`, `sumForPayment` a `paymentDetails[] { sumOfPayment, dateOfPayment }`. V `prices.documentPrices` platí: zostáva uhradiť = `sumForPayment − sumOfPayments`.
- Ďalej `documentNumber`, `numberingSequence`, `variableSymbol`, `sentStatus`, `reminderStatus` a `eInvoice`.
- Zoznam `GET /api/invoices` má filtre `PaymentStatus` (0/1), `DueDateStatus`, `OrderNumber`, `IssueDateFrom/To`, `LastModifiedTimestamp`, `NumberingSequence`, `DocumentNumberFrom/To`, `ExtendedFields` (Items, VatBreakdowns, Payments, LinkedDocuments) a stránkovanie `Top` (≤ 100) a `Skip`. Filter podľa `externalId` **nemá** ([spec][spec]).

**Webhook o úhrade** (`entityType: 2`) sa pošle po zadaní úhrady na faktúru, aj pri automaticky priradených úhradách. Treba zapnúť „Notifikácie o úhradách do API“ ([doc §3.2][doc-det]). `entities[].data` = `{ documentType, documentId, variableSymbol, sumOfPayment, dateOfPayment, hasRelatedEntity }`. `relatedEntities[]` = `{ documentType, documentId, numberingSequence, documentNumber, variableSymbol, sumOfPayments, countOfPayments, paymentStatus, orderNumber, totalPriceInclVat }` ([spec][spec], príklad v [doc §5][doc-wh]). Kombinácia `status: 404` a `operation: 0` znamená úhradu nespárovanú s dokladom ([webhooky][dev-wh]).

### 5. Limity a pravidlo 120 s

- **10 požiadaviek za 1 s a 300 za 1 min.** Obe okná platia naraz a udržateľné tempo je 5 za sekundu. Rozpočet sa počíta **na token**, nie na IP ani na firmu ([doc §4][doc-resp], [chyby][dev-err]).
- Info text v spec uvádza „max. 3 requests in a time window of 1s“ trikrát, potom 10 za 1 s a 300 za 1 min ([spec][spec] `info.description`). Prečo sú tam tri okná po 3 požiadavkách, dokumentácia nevysvetľuje (pozri Otvorené otázky).
- Hlavičky `x-rate-limit-*` prichádzajú pri úspešnej odpovedi a `retry-after` pri `429`. Na `429` a `5xx` sa má reagovať počkaním na `retry-after`, inak exponenciálnym backoffom ([chyby][dev-err]).
- Dávka má najviac 100 dokladov, pri zápise aj pri čítaní ([doc §3][doc-ep]).
- **120 s:** „Duplicate POST request sent in time window of 120 seconds will not be processed“ ([spec][spec]). Rovnaký request nejde poslať znova, ak prvý prešiel (`202`). Treba počkať 120 s ([doc §4][doc-resp]). Odpoveď `409` nesie `retryAfter` v sekundách ([spec][spec]).
- KROS odporúča po zlyhaní poslať doklad znova **s tým istým `documentNumber` a radom**, vtedy ho prepíše a duplicita nevznikne ([chyby][dev-err]). Servisník však podľa K09 číslo neposiela. Bezpečné opakovanie preto znamená najprv overiť cez `GET /api/invoices?OrderNumber=…`, či faktúra už nevznikla, a až potom poslať znova.

### 6. eFaktúra (`isEInvoice`)

- `isEInvoice: true` sa dá nastaviť iba vtedy, keď má firma **zapnutú funkciu eFaktúra** a partner má vyplnené **`taxId` (DIČ)**. Pri každej úprave sa musí poslať znova, vynechaná hodnota znamená `false` a príznak zruší ([spec][spec], [eFaktúra][dev-efa]).
- **Odoslanie cez API zatiaľ nie je.** „Samotné odoslanie eFaktúry do siete Peppol (alebo e-mailom) zatiaľ spúšťa používateľ v aplikácii KROS“, odoslanie cez API je v sekcii „Pripravujeme“ ([eFaktúra][dev-efa], [čo API umožňuje][dev-co]). Spec nemá žiadny endpoint na odoslanie ([spec][spec]).
- Stav sa číta z `GET /api/invoices/{id}` → `eInvoice { isEInvoice, status, sentAt, errorMessage, peppolId, xmlLink }`. Hodnoty `status`: `pending`, `sent`, `validationFailed`, `confirmed`, `sendingFailed`, `deliveryFailed`. `errorMessage` a `peppolId` sú iba v detaile, nie v zozname. Staršie pole `sentStatus` má hodnoty 4–10 pre eFaktúru vrátane `EInvoiceInsufficientLicense = 10` ([spec][spec], [eFaktúra][dev-efa]).
- Každá zmena stavu v sieti Peppol pošle webhook dokladu ([eFaktúra][dev-efa]). XML vo formáte Peppol BIS 3.0 vráti `GET /api/invoices/{id}/reports/einvoiceBis3`. Odoslaná eFaktúra je zamknutá a nedá sa prepísať ([eFaktúra][dev-efa]).
- Funkciu eFaktúra treba zapnúť registráciou KROS ako digitálneho poštára a aktiváciou v sieti Peppol. KROS uvádza eFaktúry ako povinné od 1. 1. 2027 ([KROS eFaktúra][efaktura]).

### Ďalšie zistenia

- `GET /api/auth/check` overí spojenie a token a odpovedá iba `200`, `401` alebo `429` ([spec][spec], [zaciname][dev-start]).
- Token sa zobrazí **iba raz** a dá sa len resetovať, čím starý prestane platiť. Jeden token platí pre Fakturáciu aj Sklad. Zrušenie prepojenia sa prejaví `401` s oneskorením rádovo minút ([doc §2][doc-auth], [manuálny token][dev-token], [consent][dev-consent]).
- Alternatíva k ručnému tokenu je Integration Consent: URL `https://firma.kros.sk/integration-consent` v režime post alebo poll, bez registrácie u KROS. Token z neho nemá expiráciu a webhook secret prichádza v Base64 ([consent][dev-consent], [tretie strany][tretie]).
- Odkaz z ticketu `https://www.kros.sk/openapi-documentation` presmeruje (301 → `/openapi-dokumentacia-2/` → `/openapi-dokumentacia/`) na slovenskú verziu. Anglická verzia už nie je dostupná. Odkaz `/swagger/v1/swagger.json` v §7 dokumentácie vracia 404. Skutočné spec URL sú `…/swagger/Api%20endpoints/swagger.json` a `…/app-webhooks-swagger.json` ([doc §7][doc], [api reference][dev-ref]). To je užitočné pre fixtures v #62.
- Oficiálny portál pre integrátorov je [developer.kros.sk][dev], kde je aj celá dokumentácia v jednom súbore [llms-full.txt][dev-llms]. Lokálne kópie spec na portáli sú zhodné so živými (overené porovnaním súborov 2026-10-21).

## Rozdiely oproti K09/K02

| # | Tvrdenie v K09/K02 | Čo hovoria zdroje | Dopad |
|---|---|---|---|
| 1 | K09: „`isEInvoice = true` … Takto KROS Fakturácia odošle eFaktúru“; Hotovo: „faktúra pre firmu s IČO odíde ako eFaktúra“ | API eFaktúru iba **označí**, odoslanie spúšťa používateľ v aplikácii KROS a odoslanie cez API sa pripravuje ([eFaktúra][dev-efa]) | kritérium Hotovo sa cez API dnes splniť nedá; treba ručný krok v KROS alebo zmenu zadania |
| 2 | K09: eFaktúra, „ak je zákazník firma s IČO“ | podmienkou je **DIČ** (`partner.taxId`) a zapnutá eFaktúra vo firme; IČO podmienkou nie je ([spec][spec]) | pravidlo v Servisníku treba postaviť na DIČ |
| 3 | K09: „pri `429` a `409` zopakuj neskôr“ | `429` opakovať po `retry-after` áno. `409` znamená, že identický request **už prešiel** (202) ([doc §4][doc-resp]). Bez `documentNumber` vytvorí opakovanie novú faktúru ([čo API umožňuje][dev-co]) | pri `409` neopakovať; čakať na webhook alebo dohľadať faktúru cez `OrderNumber` |
| 4 | K09: payload bez `vatPayerType` | `vatPayerType` je **povinné** spolu s `issueDate` ([spec][spec]) | doplniť z `firma.platca_dph` (K02) |
| 5 | K09: podpis „HMAC-SHA256, Base64“ | správne, ale kľúč aj telo sa kódujú ako **UTF-16LE** a kľúč je voliteľný „Autorizačný kľúč“, ktorý si firma nastaví sama ([doc §6][doc-sig]) | bez UTF-16LE overenie nikdy neprejde; kľúč treba pri nastavení vyplniť |
| 6 | K09: „Uhradená / Neuhradená“ | `paymentStatus` má 5 hodnôt vrátane PartiallyPaid a OverPaid ([spec][spec]); webhook o platbách treba zapnúť ([doc §3.2][doc-det]) | UI potrebuje aspoň stav „čiastočne uhradená“ |
| 7 | K09: dátový model `pdf_url` | PDF aj previewLink vyžadujú Bearer token ([spec][spec]) | ukladať `kros_id` a PDF podávať cez Servisník, nie verejnú URL |
| 8 | K09: webhook „uloží `kros_id` a číslo… zmení stav na Vyfakturovaná“ | treba kontrolovať vrchný `status` (200 alebo 207) a `entities[].status` a `problems`. Webhook chodí aj pri zmenách v aplikácii (`source: 2`) a pri zmazaní (`operation: 3`). KROS skúša doručiť najviac 3-krát ([webhook spec][wh-spec], [webhooky][dev-wh]) | handler musí rozlíšiť úspech a čiastočné zlyhanie; treba aj zálohu cez polling |
| 9 | K09: limity 10/s, 300/min a 120 s | sedí s dokumentáciou ([doc §4][doc-resp]); spec navyše spomína okná 3 za 1 s ([spec][spec]); rozpočet je na token ([chyby][dev-err]) | pre Servisník bez praktického dopadu (malý objem) |
| 10 | K02: test spojenia cez `GET /api/auth/check` | endpoint existuje, ale vracia iba 200, 401 a 429, nie `402` ([spec][spec]) | „OK“ v teste neznamená platnú licenciu; doplniť napr. `GET /api/numberingSequences`, ktorý `402` vracia |
| 11 | K02: „Nastavenia firmy → API prepojenia → Vygenerovať token“ | sedí; povinné je aj pole „Názov prepojenia“ a token sa zobrazí **iba raz** ([doc §2][doc-auth]) | do návodu pre človeka |
| 12 | K09: `POST https://api-economy.kros.sk/api/invoices`, `GET /api/invoices/{id}`, `/reports/{reportId}`, `/previewLink`, `documentNumber` nevypĺňať, polia partnera a položiek | sedí ([spec][spec], [doc §3.2][doc-det]) | — |

## Čo musí urobiť človek

Agent nič z tohto nerobil: žiadna registrácia, prihlásenie, token ani nákup.

1. **Účet a testovacia firma.** Zaregistrovať sa na fakturacia.kros.sk a založiť **samostatnú testovaciu firmu**, oddelenú od produkčnej firmy autoservisu ([FAQ][fakt]). Rozhodne Kazarr, či na vlastnom účte, alebo na účte zákazníka.
2. **Licencia pre test.** Spustiť 30-dňovú skúšobnú verziu a overiť, či `GET /api/numberingSequences` nevracia `402`. Ak trial API neobsahuje, kúpiť Základ + API prepojenie, čo robí 10,80 €/mes. bez DPH pri ročnej platbe ([cenník][cennik]).
3. **Licencia pre produkciu.** Firma autoservisu potrebuje vlastný balík s API prepojením (Základ alebo Štandard + 4,90 €, prípadne KROS Firma). Zaplatí ho zákazník, rozhodnutie a zmluva sú jeho ([cenník][cennik]).
4. **API prepojenie** v každej firme (test aj produkcia), v sekcii Nastavenia firmy → API prepojenia ([doc §2][doc-auth]):
   - vyplniť Názov prepojenia,
   - zadať URL pre príjem notifikácií (verejné HTTPS testovacieho alebo produkčného prostredia),
   - zadať Autorizačný kľúč, náhodný a 256-bitový,
   - kliknúť Vygenerovať token, token **hneď** uložiť do secretov Servisníka (pole z K02) a nikdy nie do repozitára.
5. Zapnúť „**Notifikácie o úhradách do API**“ ([doc §3.2][doc-det]). Voliteľne prepojiť bankový účet pre automatické úhrady (balík Základ a vyšší, [cenník][cennik]).
6. **eFaktúra:** vo firme zapnúť eFaktúru (KROS ako digitálny poštár, aktivácia v sieti Peppol, [KROS eFaktúra][efaktura]). Kým API neumožní odoslanie, eFaktúru odosiela človek v KROS ([eFaktúra][dev-efa]). V testovacej firme neposielať eFaktúry reálnym partnerom, sieť Peppol je produkčná.
7. **Otázky na integracie@kros.sk** ([zaciname][dev-start]): sandbox, trial s API, formát `vatRate`, okná 3 za 1 s, tvar `previewLink` a termín odoslania eFaktúry cez API (zoznam nižšie).
8. Pre #62 nahrať z testovacej firmy reálne odpovede 202, 400, 409, 429 a webhooky (dokument aj úhrada) ako fixtures.

## Riziká a otvorené otázky

**Riziká**
- **Duplicitná faktúra pri retry.** Bez `documentNumber` vznikne pri každom úspešnom POST-e nová faktúra ([čo API umožňuje][dev-co]). Timeout po odoslaní a slepé opakovanie znamená dve faktúry. `externalId` pred tým **nechráni**, lebo upsert sa riadi iba dvojicou `documentNumber` a `numberingSequence` ([doc §3.1][doc-ep]). Mitigácia: pred opakovaním dohľadať faktúru cez `GET /api/invoices?OrderNumber=<číslo zákazky>` a `409` brať ako „prijaté“. Alternatíva je, aby Servisník sám posielal `documentNumber`, čo by ale odporovalo K09 („číslo pridelí KROS“).
- **Stratený webhook.** KROS skúša doručiť najviac trikrát (1 + 2 pri `500`, nič pri `400`) a pri timeoutoch to nie je zdokumentované ([spec][spec]). Treba záložný polling, napr. `GET /api/invoices?LastModifiedTimestamp=…&ExtendedFields=Payments`, inak zákazka ostane navždy „Hotová“.
- **Ručné zmeny v KROS.** Webhook prichádza aj pri úprave alebo zmazaní faktúry v aplikácii (`source: 2`, `operation: 3`, [webhook spec][wh-spec]). Servisník musí vedieť, čo vtedy so zákazkou.
- **Zaokrúhlenie.** Posiela sa iba `totalPriceInclVat` a KROS dopočíta jednotkovú cenu a základ ([spec][spec]). Súčty v Servisníku sa môžu líšiť od KROS v centoch. Ako zdroj pravdy treba brať `prices` a `vatBreakdowns` z `GET /api/invoices/{id}`.
- **eFaktúra po 1. 1. 2027.** Ak KROS do vtedy nesprístupní odoslanie cez API, každá B2B faktúra potrebuje ručný krok v KROS ([eFaktúra][dev-efa], [KROS eFaktúra][efaktura]).
- **Duplicitní partneri** pri fyzických osobách s nekonzistentným menom alebo e-mailom ([e-shop][dev-eshop]).
- **Rozpor v dokumentácii.** [Čo API umožňuje][dev-co] tvrdí naraz, že „doklad sa cez API neupravuje ani nemaže“ a že opakované odoslanie s rovnakým číslom ho prepíše. Spec a [doc §3.1][doc-ep] potvrdzujú prepis.

**Otvorené otázky** (vyžadujú účet, token alebo odpoveď od KROS)
1. Existuje sandbox alebo testovací režim pre dátové API? V dokumentácii nie je, sú iba test a staging pre Token Broker ([token broker][dev-broker]).
2. Obsahuje 30-dňová skúšobná verzia doplnok API prepojenie? Dá sa spustiť pre druhú, testovaciu firmu?
3. Formát `vatRate`: spec v requeste uvádza `decimal(2,2)` s príkladom `0`, odpovede majú príklad `20` ([spec][spec]). Posiela sa 23, alebo 0.23?
4. Čo znamenajú okná „3 requests in 1 s“ v `info.description` spec? Platia per endpoint?
5. Podľa čoho sa request považuje za „identický“ pre `409`: celé telo, `externalId`, alebo hash? Vracia `409.requestId` ID pôvodnej požiadavky?
6. Aký tvar má odpoveď `previewLink` (string alebo objekt) a ako dlho platí URL? Je verejná, bez tokenu?
7. Posiela KROS hlavičku `X-Kros-Signature-256`, keď Autorizačný kľúč nie je nastavený?
8. Pole `relatedEntities` pri webhooku o úhrade: spec endpointov ho typuje ako `UploadedPaymentDocument[]` a príklad v dokumentácii je naplnený ([doc §5][doc-wh]), ale spec webhookov hovorí „This array is empty“ ([webhook spec][wh-spec]). Treba overiť na reálnych dátach.
9. Použije sa pri vynechaní `myCompany` a `bankAccount` profil firmy z KROS (adresa, IBAN, QR kód / PAY by square)? Spec to neuvádza.
10. Kedy bude odoslanie eFaktúry cez API dostupné ([eFaktúra][dev-efa], „Pripravujeme“)?
11. Pokrýva KROS Firma (14,90 €) to isté API `api-economy.kros.sk` ako KROS Fakturácia s doplnkom? Cenník ho uvádza ako „API prepojenie“ v balíku ([cenník][cennik]).

## Zdroje

Všetky stiahnuté 2026-10-21. Spec boli stiahnuté z live URL a analyzované lokálne.

- [doc]: KROS OpenAPI dokumentácia, https://www.kros.sk/openapi-dokumentacia/ (cieľ presmerovania z https://www.kros.sk/openapi-documentation), sekcie [§2][doc-auth], [§3.1][doc-ep], [§3.2][doc-det], [§4][doc-resp], [§5][doc-wh], [§6][doc-sig]
- [spec]: OpenAPI spec endpointov „KROS OpenAPI“ 1.0 (OpenAPI 3.0.4), https://api-economy.kros.sk/swagger/Api%20endpoints/swagger.json
- [wh-spec]: OpenAPI spec webhookov „KROS Webhooks“ 1.0, https://api-economy.kros.sk/app-webhooks-swagger.json
- [swagger]: Swagger UI, https://api-economy.kros.sk/swagger/index.html (konfigurácia v `index.js` odkazuje na obe spec vyššie)
- [dev]: KROS API pre integrátorov, https://developer.kros.sk/ (https://api.krosdoplnky.sk sem presmeruje)
- [dev-llms]: celá dokumentácia portálu, https://developer.kros.sk/ai/llms-full.txt
- [dev-co]: Čo API umožňuje, https://developer.kros.sk/co-umoznuje.html
- [dev-start]: Začíname, https://developer.kros.sk/zaciname.html
- [dev-token]: Manuálny token, https://developer.kros.sk/autorizacia/manualny-token.html
- [dev-consent]: Integration Consent, https://developer.kros.sk/autorizacia/integration-consent.html
- [dev-broker]: Token Broker, https://developer.kros.sk/autorizacia/token-broker.html
- [dev-eshop]: E-shop → KROS, https://developer.kros.sk/integracie/eshop.html
- [dev-efa]: eFaktúra, https://developer.kros.sk/integracie/efaktura.html
- [dev-wh]: Webhooky, https://developer.kros.sk/webhooky.html
- [dev-err]: Chyby a limity, https://developer.kros.sk/chyby-a-limity.html
- [dev-ref]: API reference, https://developer.kros.sk/api-reference.html
- [tretie]: KROS API, integrácia tretích strán, https://www.kros.sk/kros-api-integracia-tretich-stran/
- [cennik]: KROS Fakturácia, cenník, https://www.kros.sk/fakturacia/cennik/
- [cenniky]: KROS Cenníky (archív), https://www.kros.sk/cenniky
- [fakt]: KROS Fakturácia (FAQ: skúšobná verzia, viac firiem), https://www.kros.sk/fakturacia/
- [efaktura]: KROS eFaktúra 2027, https://www.kros.sk/efaktura/

[doc]: https://www.kros.sk/openapi-dokumentacia/
[doc-auth]: https://www.kros.sk/openapi-dokumentacia/#Vytvorenieprepojeniaaautorizciaodosielanchrequestov
[doc-ep]: https://www.kros.sk/openapi-dokumentacia/#pecifikendpointov
[doc-det]: https://www.kros.sk/openapi-dokumentacia/#aliepodrobnosti
[doc-resp]: https://www.kros.sk/openapi-dokumentacia/#Odpovenarequest
[doc-wh]: https://www.kros.sk/openapi-dokumentacia/#WebhookURLpreprjemnotifikcizAPI
[doc-sig]: https://www.kros.sk/openapi-dokumentacia/#Kontrolasprvnostinotifikcieodoslanejdowebhookuvoliten
[spec]: https://api-economy.kros.sk/swagger/Api%20endpoints/swagger.json
[wh-spec]: https://api-economy.kros.sk/app-webhooks-swagger.json
[swagger]: https://api-economy.kros.sk/swagger/index.html
[dev]: https://developer.kros.sk/
[dev-llms]: https://developer.kros.sk/ai/llms-full.txt
[dev-co]: https://developer.kros.sk/co-umoznuje.html
[dev-start]: https://developer.kros.sk/zaciname.html
[dev-token]: https://developer.kros.sk/autorizacia/manualny-token.html
[dev-consent]: https://developer.kros.sk/autorizacia/integration-consent.html
[dev-broker]: https://developer.kros.sk/autorizacia/token-broker.html
[dev-eshop]: https://developer.kros.sk/integracie/eshop.html
[dev-efa]: https://developer.kros.sk/integracie/efaktura.html
[dev-wh]: https://developer.kros.sk/webhooky.html
[dev-err]: https://developer.kros.sk/chyby-a-limity.html
[dev-ref]: https://developer.kros.sk/api-reference.html
[tretie]: https://www.kros.sk/kros-api-integracia-tretich-stran/
[cennik]: https://www.kros.sk/fakturacia/cennik/
[cenniky]: https://www.kros.sk/cenniky
[fakt]: https://www.kros.sk/fakturacia/
[efaktura]: https://www.kros.sk/efaktura/
