# Research: .NET (ASP.NET Core) pre Servisník

Ticket: [#46](https://github.com/Kazarr/Servisnik/issues/46) · vstup pre [#44 Rozhodnutie o stacku a architektúre](https://github.com/Kazarr/Servisnik/issues/44) · stav k 2026-10-21

## Otázka

Ako by vyzeral Servisník na .NET (ASP.NET Core)? Ktorý prístup k UI (Blazor alebo Razor Pages / MVC) sa hodí pre túto appku a čím by sa v zvolenej zostave pokryli: ORM a migrácie nad PostgreSQL, prihlásenie a role, HTML → PDF na A4, import `.xlsx`/`.csv`, fotky z mobilu, webhook s HMAC-SHA256, testy biznis logiky bez frameworku, DB a siete a deploy cez GitHub Actions. Zvlášť: ako spoľahlivo v tom AI agenti dodávajú funkcie, licencie knižníc a jednoduchosť deployu.

## Zhrnutie

- **Odporúčanie: ASP.NET Core 10 (LTS, podpora do 2028-11-14) s Razor Pages, nie Blazor.** Razor Pages je bezstavový model request → response. Pri migrácii 7 → 8 potreboval len novú verziu TFM, kým Blazor v .NET 8 zmenil celý model (render módy) a v interaktívnom režime drží stav v pamäti servera cez WebSocket.
- Dáta: EF Core 10 + Npgsql 10.0.3, migrácie v C# v repe, deploy cez `efbundle`. Prihlásenie: ASP.NET Core Identity (jeho UI je napísané v Razor Pages), role `admin`/`mechanik`.
- PDF: šablóny ako Razor komponenty → `HtmlRenderer` → HTML → **Gotenberg 8** (MIT, Chromium v Dockeri). Záloha: Playwright for .NET (MIT) v procese appky.
- Import: **ExcelDataReader 3.9.0** (MIT) číta `.xlsx`, `.xls` aj `.csv` jedným API. EPPlus (licencia Polyform Noncommercial) nepoužiť.
- Fotky: zmenšenie v prehliadači (`createImageBitmap` + `canvas.toBlob`, bez knižnice), server len overí a uloží. Webhook: Minimal API + `HMACSHA256.HashData` + `CryptographicOperations.FixedTimeEquals` zo štandardnej knižnice.
- Testy: doménový projekt bez referencie na ASP.NET a EF, xUnit v3. DB testy proti skutočnému PostgreSQL cez Testcontainers. Deploy: `dotnet publish /t:PublishContainer` (bez Dockerfile) z GitHub Actions.
- Všetky odporúčané knižnice majú MIT, Apache-2.0 alebo PostgreSQL licenciu, takže tržby zákazníka nerozhodujú. Hlavné riziko: Gotenberg je druhý kontajner, hosting ho musí uniesť ([#47](https://github.com/Kazarr/Servisnik/issues/47)).

## Zistenia

### 0. Verzie k 2026-10-21

| Komponent | Verzia | Poznámka | Zdroj |
|---|---|---|---|
| .NET / ASP.NET Core | **10.0.13** (LTS) | vydané 2025-11-11, podpora do 2028-11-14 | [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core) |
| .NET 9 (STS), .NET 8 (LTS) | 9.0.21, 8.0.32 | oba končia 2026-11-10, nepoužiť | [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core) |
| .NET 11 | RC2 (go-live, 2026-10-13) | pre-release, GA podľa plánu EF v novembri 2026 | [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core), [EF Core releases](https://learn.microsoft.com/en-us/ef/core/what-is-new/) |
| EF Core | 10.0.13 | podpora do 2028-11-10 | [EF Core releases](https://learn.microsoft.com/en-us/ef/core/what-is-new/), [NuGet index](https://api.nuget.org/v3-flatcontainer/microsoft.entityframeworkcore/index.json) |
| Npgsql.EntityFrameworkCore.PostgreSQL | 10.0.3 | licencia PostgreSQL, vyžaduje EF Core ≥ 10.0.4 | [NuGet](https://www.nuget.org/packages/Npgsql.EntityFrameworkCore.PostgreSQL) |

Záver: cieliť `net10.0`. Na .NET 11 nečakať, pretože vyjde až počas stavby základu.

### 1. UI: Blazor vs Razor Pages / MVC

Microsoft pre nové projekty odporúča Blazor ([Choose an ASP.NET Core UI](https://learn.microsoft.com/en-us/aspnet/core/tutorials/choose-web-ui?view=aspnetcore-10.0)). Pre Servisník a pre stavbu AI agentmi to podľa zistení nižšie neplatí:

| Kritérium | Blazor Web App (.NET 10) | Razor Pages |
|---|---|---|
| Model | Render módy: Static SSR, Interactive Server, WebAssembly, Auto. Komponent bez render módu je statický: tlačidlo s `@onclick` sa vykreslí, ale „isn't interactive and doesn't call the `UpdateMessage` method“ ([render modes](https://learn.microsoft.com/en-us/aspnet/core/blazor/components/render-modes?view=aspnetcore-10.0)). Chyba sa ukáže až v prehliadači, kompilácia ani unit test ju nezachytia. | Stránka = `PageModel` (`OnGet`/`OnPost`) + `.cshtml`. Každá akcia je HTTP požiadavka ([Razor Pages](https://learn.microsoft.com/en-us/aspnet/core/tutorials/choose-web-ui?view=aspnetcore-10.0)). |
| Stabilita API (tréningové dáta agentov) | .NET 8 nahradil Blazor Server novým Blazor Web App (`_Host.cshtml` → `App.razor`, `AddServerSideBlazor` → `AddRazorComponents`, `<CascadingAuthenticationState>` sa už nepoužíva) ([migrácia 7→8](https://learn.microsoft.com/en-us/aspnet/core/migration/70-to-80?view=aspnetcore-10.0)). .NET 10 zase zrušil `<NotFound>` v `Router` ([novinky v ASP.NET Core 10](https://learn.microsoft.com/en-us/aspnet/core/release-notes/aspnetcore-10.0?view=aspnetcore-10.0)). | Migrácia 7→8 pre Razor Pages znamená len zmenu TFM a verzií balíčkov ([migrácia 7→8](https://learn.microsoft.com/en-us/aspnet/core/migration/70-to-80?view=aspnetcore-10.0)). |
| Stav a sieť | Interactive Server drží stav používateľa v pamäti servera („circuit“) a spojenie cez SignalR. Najlepšie funguje cez WebSockets, proxy ich musí prepúšťať a pri škálovaní treba session affinity ([hosting Blazor](https://learn.microsoft.com/en-us/aspnet/core/blazor/host-and-deploy/server/?view=aspnetcore-10.0)). Odpojený circuit sa drží 3 minúty (`DisconnectedCircuitRetentionPeriod`, [CircuitOptions.cs](https://github.com/dotnet/aspnetcore/blob/release/10.0/src/Components/Server/src/CircuitOptions.cs)). Perzistencia stavu z .NET 10 funguje len pre vlastnosti označené `[PersistentState]` ([state management](https://learn.microsoft.com/en-us/aspnet/core/blazor/state-management/server?view=aspnetcore-10.0)). Na mobile OS uspí JavaScript stránky „within seconds on Android“ po prepnutí appky, napríklad do fotoaparátu ([state management](https://learn.microsoft.com/en-us/aspnet/core/blazor/state-management/server?view=aspnetcore-10.0)). | Bezstavové. Výpadok Wi-Fi v dielni stratí nanajvýš jeden POST. Na proxy netreba nič špeciálne. |
| DB v UI | V Interactive Server je scoped `DbContext` zdieľaný v celom circuite a „isn't thread safe“. Treba `IDbContextFactory` a kontext na operáciu ([Blazor + EF Core](https://learn.microsoft.com/en-us/aspnet/core/blazor/blazor-ef-core?view=aspnetcore-10.0)). Agenti to ľahko spravia zle. | Štandardné `AddDbContext` (scoped = jedna HTTP požiadavka) je správne bez úprav. |
| Prihlásenie | Identity stránky v šablóne musia bežať v static SSR (cookies), aj keď je zvyšok appky interaktívny ([render modes](https://learn.microsoft.com/en-us/aspnet/core/blazor/components/render-modes?view=aspnetcore-10.0)). Appka tak vždy mieša dva režimy. | Identity UI je Razor Class Library postavená na Razor Pages ([Identity](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity?view=aspnetcore-10.0)). Používa rovnakú technológiu ako zvyšok appky. |
| Interaktivita bez JS | Silná stránka: živé vyhľadávanie, prepočty a mapovanie stĺpcov v C#. | Treba bežné formuláre a trochu vlastného JS (zmenšenie fotky, prípadne živé hľadanie). |
| Testy | Komponenty cez bUnit 2.12.5 (MIT) ([NuGet](https://www.nuget.org/packages/bunit)). Na interaktivitu treba prehliadač. | `WebApplicationFactory` spustí appku in-memory a test overí HTML bez prehliadača. Dokumentácia je napísaná pre Razor Pages a MVC ([integration tests](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0)). |

**Spoľahlivosť AI agentov (úsudok, nemeraný).** Primárny zdroj, ktorý by meral úspešnosť agentov podľa frameworku, neexistuje. Úsudok stojí na doložených faktoch z tabuľky. Razor Pages má jeden stabilný model a chyba v ňom väčšinou zlyhá hlasno: kompilácia, 404 alebo test nad HTML. Blazor má viac režimov, ktoré sa medzi verziami menili, a jeho typická chyba (statický komponent s `@onclick`) je tichá. Pri stavbe agentmi s overovaním cez testy je preto Razor Pages bezpečnejšia voľba.

**MVC** stojí na rovnakom základe ako Razor Pages ([Choose UI](https://learn.microsoft.com/en-us/aspnet/core/tutorials/choose-web-ui?view=aspnetcore-10.0)). Pre CRUD orientovaný na stránky by však pridal len réžiu navyše (controller + view + routovanie). Endpointy bez UI (webhook, PDF) budú Minimal API.

**Voľba: Razor Pages.** Blazor ostáva ako upgrade pre jeden konkrétny interaktívny widget: Razor komponent sa dá vložiť do Razor Page cez Component Tag Helper ([Choose UI](https://learn.microsoft.com/en-us/aspnet/core/tutorials/choose-web-ui?view=aspnetcore-10.0)). Odporúčam ho použiť len pri preukázanej potrebe.

### 2. ORM a verziované migrácie nad PostgreSQL

- **EF Core 10 + Npgsql provider 10.0.3**, `UseNpgsql(...)` ([Npgsql EF Core](https://www.npgsql.org/efcore/index.html), [NuGet](https://www.nuget.org/packages/Npgsql.EntityFrameworkCore.PostgreSQL)).
- **Migrácie** vznikajú cez `dotnet ef migrations add <Názov>` ako C# súbory, ktoré sa commitujú do repa. Pre automatický deploy EF odporúča **migration bundle**: `dotnet ef migrations bundle --self-contained --target-runtime linux-x64`. Výsledný `efbundle` beží „without the .NET SDK, the EF Core tools, or the application's source code“ ako jednorazový job pred štartom appky. `dotnet ef` nemá byť v image appky ([Applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)).
- Od EF 9 zamyká migrácie databázový lock. `MigrateAsync()` pri štarte je preto prijateľný pre appku s jednou inštanciou. EF uprednostňuje bundle, ak treba review, oddelené oprávnenia alebo rollback ([Applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)).
- CI kontrola: `dotnet ef migrations has-pending-model-changes`. Od EF 9 `Migrate()` padá, ak model nemá migráciu ([Applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)).
- **Pasce, ktoré treba zapísať agentom do pravidiel:**
  - `DateTime` do `timestamptz` musí byť UTC. Inak Npgsql od verzie 6.0 hodí výnimku ([Npgsql date/time](https://www.npgsql.org/doc/types/datetime.html)). Na termín zákazky použiť `DateOnly` → `date` (tamže).
  - Hľadanie bez ohľadu na veľkosť písmen (meno zákazníka, ŠPZ): `EF.Functions.ILike` alebo nedeterministická ICU kolácia na stĺpci ([Npgsql collations](https://www.npgsql.org/efcore/misc/collations-and-case-sensitivity.html)). VIN sa ukladá veľkými písmenami (K04), tam stačí `=`/`LIKE`.

### 3. Prihlásenie e-mailom a heslom, role admin / mechanik

- **ASP.NET Core Identity**. Šablóna `dotnet new webapp -au Individual` vytvorí Razor Pages appku s Identity (predvolene nad SQLite, provider sa prepne na Npgsql). Identity UI je RCL nad Razor Pages a jednotlivé stránky sa dajú vygenerovať cez `dotnet aspnet-codegenerator identity` ([Identity](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity?view=aspnetcore-10.0)).
- Heslo sa hashuje cez PBKDF2 so 100 000 iteráciami (predvolené) ([PasswordHasherOptions.IterationCount](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.identity.passwordhasheroptions.iterationcount?view=aspnetcore-10.0)). Lockout sa nastavuje cez `options.Lockout.*` ([Identity](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity?view=aspnetcore-10.0)).
- **Verejná registrácia sa musí vypnúť**, používateľov zakladá admin. Postup je zdokumentovaný v sekcii „Disable a page“ ([Scaffold Identity](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/scaffold-identity?view=aspnetcore-10.0#disable-a-page)). Predvolená stránka `RegisterConfirmation` je „only for testing“ ([Identity](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity?view=aspnetcore-10.0)).
- **Role**: `AddRoles<IdentityRole>()`, potom `[Authorize(Roles = "admin")]` alebo politika `RequireRole` na `PageModel` ([Role v Razor Pages](https://learn.microsoft.com/en-us/aspnet/core/razor-pages/security/authorization/roles?view=aspnetcore-10.0)). Obmedzenie: atribút nejde dať na jednotlivý handler, len na celý `PageModel`. Pre handler sa volá `IAuthorizationService.AuthorizeAsync` alebo `User.IsInRole` (tamže). Na roly záleží veľkosť písmen (tamže).
- „Mechanik nevidí ceny“ (K01, K06, K08) nestačí skryť vo view. Read model pre mechanika nemá ceny vôbec obsahovať. Overí sa to testom (sekcia 7).
- **Data Protection kľúče** (šifrujú prihlasovaciu cookie): ak nie je kam ich uložiť, „all generated keys are lost“ pri ukončení procesu. V kontajneri sa preto musia ukladať do volume alebo externého úložiska ([DP key management](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/default-settings?view=aspnetcore-10.0)). Riešenie bez ďalšej infraštruktúry: `PersistKeysToDbContext` do PostgreSQL (balík `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore`) ([key storage providers](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-storage-providers?view=aspnetcore-10.0)). Bez toho sa používatelia odhlásia po každom deployi.

### 4. Tlač HTML → PDF na A4

**Šablóny:** tri tlačové šablóny (zákazkový list, cenová ponuka, odovzdávací protokol) ako Razor komponenty (`.razor`) bez interaktivity. `HtmlRenderer` ich vyrenderuje do HTML stringu aj mimo HTTP požiadavky ([Render components outside ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/blazor/components/render-components-outside-of-aspnetcore?view=aspnetcore-10.0)). Tým je šablóna testovateľná unit testom (napr. že verzia pre mechanika neobsahuje „€“) bez prehliadača. Komponenty tu slúžia len ako typované šablóny, nie je to Blazor UI.

**Prevod HTML → PDF, porovnanie s licenciami:**

| Nástroj | Licencia | Ako | Verdikt |
|---|---|---|---|
| **Gotenberg 8** (v8.38.1, 2026-10-15) | MIT ([GitHub](https://github.com/gotenberg/gotenberg), [release](https://github.com/gotenberg/gotenberg/releases)) | Docker `gotenberg/gotenberg:8` ([intro](https://gotenberg.dev/docs/getting-started/introduction)), `POST /forms/chromium/convert/html` so súborom `index.html` ([HTML route](https://gotenberg.dev/docs/convert-with-chromium/convert-html-to-pdf)) | **Odporúčané.** Appka len pošle HTML cez `HttpClient`. Chromium beží mimo procesu appky a image appky ostane bez Dockerfile. Rovnako funguje aj pre TypeScript stack (#44). |
| Playwright for .NET 1.63.0 (NuGet) | MIT ([NuGet](https://www.nuget.org/packages/Microsoft.Playwright), [LICENSE](https://github.com/microsoft/playwright-dotnet/blob/main/LICENSE)) | `page.SetContentAsync(html)` + `page.PdfAsync(new() { Format = "A4", PrintBackground = true })` ([Page API](https://playwright.dev/dotnet/docs/api/class-page)). Prehliadač sa inštaluje cez `playwright.ps1 install --with-deps --only-shell` ([browsers](https://playwright.dev/dotnet/docs/browsers)). | **Záloha**, ak hosting unesie len jeden kontajner. Oficiálny Docker image je podľa autorov „intended to be used for testing and development purposes only“ a beží ako root bez sandboxu ([Docker](https://playwright.dev/dotnet/docs/docker)). Treba teda vlastný Dockerfile s Chromiom. |
| PuppeteerSharp (v25.15.0) | MIT ([GitHub](https://github.com/hardkoded/puppeteer-sharp)) | `BrowserFetcher` stiahne prehliadač za behu (tamže) | Funkčne podobný Playwrightu, ale nie je od Microsoftu. Nemá výhodu. |
| QuestPDF | Community licencia zadarmo len pri ročných tržbách pod 1 000 000 USD, inak platená licencia pred produkčným použitím ([License guide](https://www.questpdf.com/license/guide.html)) | C# fluent API, nie HTML | Nie: zadanie chce HTML šablóny a licencia závisí od tržieb. |
| iText (pdfHTML) | AGPL alebo komerčná ([LICENSE](https://github.com/itext/itext-dotnet/blob/develop/LICENSE.md), [pdfHTML](https://github.com/itext/i7n-pdfhtml/blob/develop/LICENSE.md)) | knižnica | Nie: AGPL alebo platená licencia. |
| wkhtmltopdf (DinkToPdf a pod.) | — | repo je archivované, posledný push 2022-11-22 ([GitHub](https://github.com/wkhtmltopdf/wkhtmltopdf)) | Nie: projekt je mŕtvy. |

**Pasca A4 (K08 „bez orezania“):** Playwright aj Gotenberg majú predvolene **Letter**, nie A4. Playwright: „Defaults to 'Letter'“ ([Page API](https://playwright.dev/dotnet/docs/api/class-page)). Gotenberg: `paperWidth` 8.5 a `paperHeight` 11 ([HTML route](https://gotenberg.dev/docs/convert-with-chromium/convert-html-to-pdf)). Treba nastaviť `paperWidth=8.27in`, `paperHeight=11.7in` a `printBackground=true` (pri Playwrighte `Format = "A4"`). Alternatíva je CSS `@page { size: A4 }` s `preferCssPageSize=true` (tamže). Playwright `page.pdf()` renderuje s `print` CSS médiom ([Playwright docs source](https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-page.md)), takže tlačové štýly patria do `@media print`.

### 5. Import `.xlsx` a `.csv`

| Knižnica | Verzia | Licencia | Formáty | Verdikt |
|---|---|---|---|---|
| **ExcelDataReader** | 3.9.0 | MIT ([NuGet](https://www.nuget.org/packages/ExcelDataReader)) | xlsx, xlsb, xls, csv ([README](https://github.com/ExcelDataReader/ExcelDataReader/blob/develop/README.md)) | **Odporúčané**: jedno API (`IExcelDataReader`) pre všetky formáty z K07 |
| ClosedXML | 0.105.1 | MIT ([NuGet](https://www.nuget.org/packages/ClosedXML)) | xlsx (čítanie aj zápis) | Rezerva, ak treba aj export do xlsx |
| MiniExcel | 1.46.0 | Apache-2.0 ([NuGet](https://www.nuget.org/packages/MiniExcel)) | xlsx | Rezerva |
| CsvHelper | 33.1.0 | MS-PL OR Apache-2.0 ([NuGet](https://www.nuget.org/packages/CsvHelper)) | csv | Netreba, ak stačí ExcelDataReader |
| EPPlus | 8.7.2 | Polyform Noncommercial alebo komerčná. „will require a commercial license to be used in a commercial business“ ([NuGet](https://www.nuget.org/packages/EPPlus)) | xlsx | **Nie**, je to platená licencia pre autoservis |

Detaily ExcelDataReader podstatné pre K07 ([README](https://github.com/ExcelDataReader/ExcelDataReader/blob/develop/README.md)):

- `ExcelReaderFactory.CreateReader` (xlsx/xls) a `CreateCsvReader` (csv). Čítanie je po riadkoch a stĺpcoch podľa indexu, čo sedí na mapovanie písmen stĺpcov `{"kod":"A",...}` z K07.
- CSV: oddeľovač sa zistí automaticky z `, ; TAB | #`. Pri CSV bez BOM, ktoré nie je platné UTF-8, sa použije `FallbackEncoding` (predvolene cp1252). Všetky hodnoty z CSV sú stringy a čísla parsuje volajúci, takže treba explicitnú kultúru (desatinná čiarka).
- Slovenský Excel na Windows ukladá CSV typicky v cp1250 (overiť na vzorke [#63](https://github.com/Kazarr/Servisnik/issues/63)). .NET bez registrácie providera podporuje len ASCII, ISO-8859-1 a UTF kódovania. Pre cp1250 treba `Encoding.RegisterProvider(CodePagesEncodingProvider.Instance)` ([CodePagesEncodingProvider](https://learn.microsoft.com/en-us/dotnet/api/system.text.codepagesencodingprovider?view=net-10.0)).
- Parser (Stream → riadky → validované položky + chybné riadky) je čistá funkcia nad súborom a testuje sa na fixture z Partslinku ([#63](https://github.com/Kazarr/Servisnik/issues/63)).

### 6. Nahrávanie a zmenšenie fotiek z mobilu

- **Výber fotky:** `<input type="file" accept="image/*" capture="environment">`. Atribút `capture` nie je Baseline a na desktope sa otvorí bežný výber súboru ([MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)).
- **Zmenšenie v prehliadači bez knižnice:**
  - `createImageBitmap(file, { resizeWidth, resizeQuality: "high" })` aplikuje EXIF orientáciu predvolene (`imageOrientation: "from-image"`) a je Baseline od 09/2021 ([MDN createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)).
  - Potom `canvas.toBlob(cb, "image/jpeg", 0.8)`, Baseline od 01/2020 ([MDN toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)).
  - Spolu cca 20 riadkov JS a mechanik nahráva stovky KB namiesto MB.
- **Server (Razor Pages, `IFormFile`):**
  - Kestrel prijme predvolene max. 30 000 000 B na požiadavku. Bufferovaný súbor nad 64 KB ide na disk ([File uploads](https://learn.microsoft.com/en-us/aspnet/core/mvc/models/file-uploads?view=aspnetcore-10.0)).
  - Bezpečnosť podľa tej istej stránky: vlastný náhodný názov súboru (`Path.GetRandomFileName()`), ukladať mimo adresára appky, allowlist prípon, kontrola signatúry (JPEG `FF D8 FF`), limit veľkosti, validácia na serveri, lebo klientske kontroly sa dajú obísť.
- **Zmenšenie na serveri (len ak treba ako poistku):** SkiaSharp 4.153.1, MIT, na Linuxe s `SkiaSharp.NativeAssets.Linux` ([NuGet](https://www.nuget.org/packages/SkiaSharp)). **ImageSharp nie**: Six Labors vyžaduje komerčnú licenciu pre closed-source for-profit softvér firmy s tržbami nad 1M USD ([Six Labors pricing](https://sixlabors.com/pricing/)).
- Pre porovnanie: Blazor má `RequestImageFileAsync`, ktorý zmenší obrázok v prehliadači, ale výsledok „should be treated as untrusted“ ([API](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.components.forms.browserfileextensions.requestimagefileasync?view=aspnetcore-10.0)). Dokumentácia ho označuje ako „most appropriate for Blazor WebAssembly apps“ ([Blazor file uploads](https://learn.microsoft.com/en-us/aspnet/core/blazor/file-uploads?view=aspnetcore-10.0)). Výhodou pre Blazor teda nie je.

### 7. Webhook s overením HMAC-SHA256

Minimal API endpoint vedľa Razor Pages. Telo požiadavky „isn't buffered by default … can't be read multiple times“ ([Minimal API binding](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/parameter-binding?view=aspnetcore-10.0)). Preto sa načíta raz do `byte[]`, overí sa a tie isté bajty sa deserializujú:

```csharp
app.MapPost("/webhooks/kros", async (HttpRequest req, KrosWebhookHandler handler) =>
{
    using var ms = new MemoryStream();
    await req.Body.CopyToAsync(ms);
    var body = ms.ToArray();
    if (!KrosSignature.IsValid(handler.Secret, body, req.Headers["X-Kros-Signature-256"]))
        return Results.Unauthorized();
    await handler.HandleAsync(body);
    return Results.Ok();
});

// Servisnik.Domain: čistá funkcia, unit-testovaná na zaznamenanom payloade (#62)
public static class KrosSignature
{
    public static bool IsValid(byte[] secret, byte[] body, string? header)
    {
        var sig = new byte[32];
        return header is not null
            && Convert.TryFromBase64String(header, sig, out var n) && n == 32
            && CryptographicOperations.FixedTimeEquals(HMACSHA256.HashData(secret, body), sig);
    }
}
```

- `HMACSHA256.HashData(key, source)` je statické API od .NET 6 ([API](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.hmacsha256.hashdata?view=net-10.0)).
- `FixedTimeEquals` porovnáva bez úniku časovej informácie a predčasne skončí len pri rozdielnej dĺžke ([API](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.cryptographicoperations.fixedtimeequals?view=net-10.0)).
- Nie je na to potrebná žiadna knižnica. Názov hlavičky a Base64 sú z K09 ([#34](https://github.com/Kazarr/Servisnik/issues/34)). Čo presne KROS podpisuje, rieši [#48](https://github.com/Kazarr/Servisnik/issues/48).

### 8. Testovanie biznis logiky bez frameworku, databázy a siete

- **Rozdelenie projektov:**
  - `Servisnik.Domain` je class library bez referencie na ASP.NET Core, EF Core a `HttpClient`. Obsahuje sumy, maržu, DPH, číslovanie `Z2026-0001`, prechody stavov zákazky, validáciu VIN, parser importu, overenie podpisu a výber read modelu pre rolu.
  - `Servisnik.Web` (Razor Pages + EF + Identity) volá doménu.
  - Testy domény sú obyčajné C# volania, napríklad xUnit v3 4.0.2, Apache-2.0 ([NuGet](https://www.nuget.org/packages/xunit.v3)).
- **DB:** EF dokumentácia odporúča testovať proti skutočnej DB. In-memory provider je „highly discouraged“ a mockovanie `DbSet` pre dotazy nemá zmysel ([EF testing strategy](https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy)). PostgreSQL pre testy spustí Testcontainers.PostgreSql 4.16.0, MIT ([NuGet](https://www.nuget.org/packages/Testcontainers.PostgreSql)). GitHub runner `ubuntu-24.04` má Docker 28.0.4 ([runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)).
- **HTTP/UI:** `WebApplicationFactory` (balík `Microsoft.AspNetCore.Mvc.Testing`) spustí appku na in-memory `TestServer`, služby sa nahradia cez `ConfigureTestServices` ([integration tests](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0)). Tak sa dá overiť napríklad, že HTML pre mechanika neobsahuje ceny. Na pár smoke ciest v prehliadači stačí Playwright for .NET (tamže ho odporúčajú pre testy v prehliadači).
- **KROS:** `HttpClient` s vlastným `HttpMessageHandler`, ktorý vracia zaznamenané reálne odpovede ([#62](https://github.com/Kazarr/Servisnik/issues/62)), presne podľa pravidla v `AGENTS.md`.
- **Návrh na verify tiers v `AGENTS.md`:**

  | Tier | Príkaz |
  |---|---|
  | edit | `dotnet build --no-restore` |
  | ticket | `dotnet test --filter "Category!=E2E"` (doména + Testcontainers + WebApplicationFactory) |
  | batch | `dotnet test --filter "Category=E2E"` (Playwright) |
  | deploy | HTTP smoke na `/health` a prihlasovaciu stránku |

### 9. Deploy na hosting s PostgreSQL cez GitHub Actions

- **CI:**
  - `actions/setup-dotnet@v4` s `dotnet-version: '10.0.x'`, potom `dotnet restore` → `build --no-restore` → `test --no-build`. Cache NuGetu vyžaduje `packages.lock.json` ([GitHub Docs .NET](https://docs.github.com/en/actions/tutorials/build-and-test-code/net)).
  - Runner `ubuntu-24.04` má predinštalovaný .NET SDK 10.0.x, Docker aj PowerShell 7.6.6 ([runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)).
- **Image appky bez Dockerfile:**
  - `dotnet publish --os linux --arch x64 /t:PublishContainer -p ContainerRegistry=ghcr.io`. SDK vytvorí image bez Dockeru a pushne ho priamo do registry ([Containerize with dotnet publish](https://learn.microsoft.com/en-us/dotnet/core/containers/sdk-publish)).
  - .NET image počúvajú od .NET 8 na porte 8080 ([migrácia 7→8](https://learn.microsoft.com/en-us/aspnet/core/migration/70-to-80?view=aspnetcore-10.0)).
- **Migrácie:** v CI `dotnet ef migrations bundle --self-contained --target-runtime linux-x64`. Pri deployi sa spustí `./efbundle --connection "$DEPLOYMENT_CONNECTION_STRING"` ako jednorazový krok pred novou verziou appky, connection string ide zo secret store ([Applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)).
- **Topológia:** kontajner appky + `gotenberg/gotenberg:8` + PostgreSQL (spravovaný alebo kontajner), napr. `docker compose` na VPS. Volume (alebo DB) pre Data Protection kľúče a fotky. Výber konkrétneho hostingu rieši [#47](https://github.com/Kazarr/Servisnik/issues/47). Razor Pages nekladie na proxy špeciálne požiadavky, Blazor Interactive Server by potreboval WebSockets ([hosting Blazor](https://learn.microsoft.com/en-us/aspnet/core/blazor/host-and-deploy/server/?view=aspnetcore-10.0)).

## Riziká a otvorené otázky

1. **Druhý kontajner pre PDF.** Ak hosting z [#47](https://github.com/Kazarr/Servisnik/issues/47) unesie len jeden kontajner (typický PaaS), treba Playwright v procese appky, vlastný Dockerfile s Chromiom a `--with-deps` a stratí sa „publish bez Dockerfile“ ([Playwright Docker](https://playwright.dev/dotnet/docs/docker), [browsers](https://playwright.dev/dotnet/docs/browsers)). Rozhodnutie závisí od #47.
2. **Spoľahlivosť AI agentov je úsudok, nie meranie.** Ak #44 chce dôkaz, lacný spike je nechať agenta postaviť K03 (Zákazníci) v Razor Pages aj v Blazore a porovnať, koľko zásahov bolo treba.
3. **Podpis KROS webhooku.** Nevieme, či KROS podpisuje surové telo, aký kľúč používa (webhook secret vs. API token) a či posiela timestamp proti replay. Rieši [#48](https://github.com/Kazarr/Servisnik/issues/48), testovací prístup [#61](https://github.com/Kazarr/Servisnik/issues/61) (vyžaduje účet, nebolo overené).
4. **Kódovanie a formát exportu z Partslinku** (cp1250 vs UTF-8, oddeľovač, desatinná čiarka, xlsx vs csv). Overí sa až na vzorke [#63](https://github.com/Kazarr/Servisnik/issues/63).
5. **Tabuľka `pouzivatel` z K01 vs. Identity.** Identity má vlastnú schému (`AspNetUsers`, `AspNetRoles`, `AspNetUserRoles`). Odporúčam ju prijať tak, ako je, a `aktivny` riešiť cez lockout alebo vlastný stĺpec, nie vlastnou autentifikáciou. Rozhodnutie pre #44.
6. **Hľadanie bez diakritiky** („Stefan“ nájde „Štefan“): ILIKE ani case-insensitive kolácia to podľa citovaných zdrojov neriešia. Možnosti (PostgreSQL `unaccent`, ICU kolácia s ignorovaním diakritiky) som neoveroval. Otvorené pre K03.
7. **Kde ležia fotky** (volume, `bytea` v PostgreSQL alebo objektové úložisko) a ako sa zálohujú spolu s dennou zálohou DB (K10). Závisí od #47.
8. **.NET 11** vyjde v novembri 2026 počas stavby. Ostať na .NET 10 LTS, upgrade až po odovzdaní.
9. **Neoverené:** veľkosť Docker image Gotenbergu a jeho pamäťová náročnosť na malom VPS, ceny komerčných licencií (EPPlus, QuestPDF, ImageSharp, iText). Odporúčaná zostava ich nepotrebuje.

## Zdroje

**.NET, ASP.NET Core, EF Core (Microsoft)**
- https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core
- https://learn.microsoft.com/en-us/ef/core/what-is-new/
- https://learn.microsoft.com/en-us/aspnet/core/tutorials/choose-web-ui?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/blazor/components/render-modes?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/blazor/blazor-ef-core?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/blazor/host-and-deploy/server/?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/blazor/state-management/server?view=aspnetcore-10.0
- https://github.com/dotnet/aspnetcore/blob/release/10.0/src/Components/Server/src/CircuitOptions.cs
- https://learn.microsoft.com/en-us/aspnet/core/release-notes/aspnetcore-10.0?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/migration/70-to-80?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/blazor/components/render-components-outside-of-aspnetcore?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/blazor/file-uploads?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.components.forms.browserfileextensions.requestimagefileasync?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
- https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy
- https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/security/authentication/individual?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/security/authentication/scaffold-identity?view=aspnetcore-10.0#disable-a-page
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.identity.passwordhasheroptions.iterationcount?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/razor-pages/security/authorization/roles?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/default-settings?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-storage-providers?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/mvc/models/file-uploads?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/parameter-binding?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.hmacsha256.hashdata?view=net-10.0
- https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.cryptographicoperations.fixedtimeequals?view=net-10.0
- https://learn.microsoft.com/en-us/dotnet/api/system.text.codepagesencodingprovider?view=net-10.0
- https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0
- https://learn.microsoft.com/en-us/dotnet/core/containers/sdk-publish

**Npgsql**
- https://www.nuget.org/packages/Npgsql.EntityFrameworkCore.PostgreSQL
- https://www.npgsql.org/efcore/index.html
- https://www.npgsql.org/efcore/misc/collations-and-case-sensitivity.html
- https://www.npgsql.org/doc/types/datetime.html

**PDF**
- https://gotenberg.dev/docs/getting-started/introduction
- https://gotenberg.dev/docs/convert-with-chromium/convert-html-to-pdf
- https://github.com/gotenberg/gotenberg (LICENSE MIT, release v8.38.1)
- https://playwright.dev/dotnet/docs/api/class-page
- https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-page.md
- https://playwright.dev/dotnet/docs/docker
- https://playwright.dev/dotnet/docs/browsers
- https://www.nuget.org/packages/Microsoft.Playwright
- https://github.com/microsoft/playwright-dotnet/blob/main/LICENSE
- https://github.com/hardkoded/puppeteer-sharp
- https://www.questpdf.com/license/guide.html
- https://github.com/itext/itext-dotnet/blob/develop/LICENSE.md
- https://github.com/itext/i7n-pdfhtml/blob/develop/LICENSE.md
- https://github.com/wkhtmltopdf/wkhtmltopdf

**Excel / CSV**
- https://github.com/ExcelDataReader/ExcelDataReader/blob/develop/README.md
- https://www.nuget.org/packages/ExcelDataReader
- https://www.nuget.org/packages/ClosedXML
- https://www.nuget.org/packages/MiniExcel
- https://www.nuget.org/packages/CsvHelper
- https://www.nuget.org/packages/EPPlus

**Obrázky, prehliadač**
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture
- https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- https://www.nuget.org/packages/SkiaSharp
- https://sixlabors.com/pricing/

**Testy, CI**
- https://www.nuget.org/packages/xunit.v3
- https://www.nuget.org/packages/Testcontainers.PostgreSql
- https://www.nuget.org/packages/bunit
- https://docs.github.com/en/actions/tutorials/build-and-test-code/net
- https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md
